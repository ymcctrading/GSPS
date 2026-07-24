# Runbook

Operational checklist for when something in GSPS breaks. This app runs
unattended crons and depends on five external APIs — most incidents trace
back to one of those.

## Dashboard shows no signals / "awaiting first scan"

The `daily_scans` table is only populated by `/api/market-scan`, which runs
on Vercel Cron (weekdays, 12:30 and 21:30 UTC — see `vercel.json`).

1. Check Vercel → Project → Cron Jobs for the last run status and logs.
2. If the cron didn't fire: confirm the deployment it's attached to is
   actually in production (`vercel.json`'s `git.deploymentEnabled: false`
   means nothing auto-deploys — a stale production build with an old cron
   config can be running). Trigger a manual production deploy if needed.
3. If the cron fired but failed: check the response. `401 Unauthorized`
   means `CRON_SECRET` isn't set (or doesn't match) in the Vercel project's
   env vars — see `app/api/market-scan/route.ts`.
4. To test manually, call the endpoint with the cron secret:
   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/market-scan
   ```

## A market-data endpoint (crypto/forex/futures) is failing

1. Identify the provider from the route: `/api/crypto` → Binance,
   `/api/forex` → Oanda, `/api/futures` → Twelve Data (default) or Polygon.
2. Check `docs/THIRD_PARTY_LIMITS.md` for that provider's rate limit —
   a `429` or `502` is very often a limit, not a real outage.
3. Confirm the relevant API key is set in Vercel env vars (`OANDA_API_KEY`,
   `TWELVE_DATA_API_KEY`, `POLYGON_API_KEY`) — missing keys fail closed with
   a `502` and an error message naming the missing var.
4. For futures, `/api/futures` accepts `?provider=polygon` as a fallback if
   Twelve Data is down or rate-limited.
5. If none of the above, check the provider's own status page.

## Alpaca (paper or live trading) errors

1. Confirm which credential set is in play — paper (`ALPACA_API_KEY`/
   `ALPACA_API_SECRET`, with several accepted aliases — see
   `lib/brokers/alpaca.ts:envCreds`) vs. live (`ALPACA_LIVE_API_KEY`/
   `ALPACA_LIVE_API_SECRET`).
2. Check Alpaca's status page and the account's activity log for
   rejected/flagged orders.
3. If a live-money order behaved unexpectedly, treat it as a security-
   relevant incident per `SECURITY.md`, not just a bug — verify the key
   wasn't leaked before assuming it's a code bug.

## SnapTrade linking is broken

`lib/brokers/snaptrade.ts` feature-flags the entire integration off if
`SNAPTRADE_CLIENT_ID`/`SNAPTRADE_CONSUMER_KEY` aren't set — the UI should
show "coming soon" in that case, not an error. If keys are set and it's
still failing:
1. Confirm the SnapTrade partner dashboard shows the app in the expected
   environment (sandbox vs. production).
2. Check `connectionPortalUrl`'s `redirectTo` matches an allowed redirect
   URI configured with SnapTrade.

## Supabase is unreachable / project paused

Free-tier Supabase projects can pause after inactivity (see
`docs/THIRD_PARTY_LIMITS.md`). Resume the project from the Supabase
dashboard; there's no code-side workaround.

## A deploy needs to go out

Per `AGENTS.md`, deploys never happen automatically. To ship:
1. Confirm the target branch has the intended commits merged into `main`
   (or deploy a specific branch to preview).
2. Explicitly request the deploy and specify **preview** or **production**.
3. After a production deploy, spot-check `/api/market-scan` (cron auth),
   one market-data route, and the dashboard load before considering it done.

## Rollback

```bash
# Revert the offending commit(s) on main
git revert <sha>
git push origin main
# Then explicitly request a production redeploy — it will not happen automatically.
```

Or use the Vercel dashboard to promote a previous production deployment
directly, which is faster than a code revert when the previous build is
known-good.

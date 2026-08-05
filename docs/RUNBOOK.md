# Runbook

Operational checklist for when something in GSPS breaks. This app runs
unattended crons and depends on five external APIs — most incidents trace
back to one of those.

## Dashboard shows no signals, or a stale scan date

`daily_scans` is written by `/api/market-scan`: on Vercel Cron (weekdays,
12:30 and 21:30 UTC — see `vercel.json`) and by the dashboard's own Refresh
scan button, which POSTs the same route as the signed-in user.

Read the scan date on the dashboard first — it says which failure this is.

**The date is old and the button reports "nothing was saved".** The scan ran;
the write was refused. The message carries the Postgres error verbatim,
including its code:

- `23502` (not-null violation) — a row reached the insert without a complete
  trade plan. `daily_scans` requires all four price columns (migration
  `0006`); `hasTradePlan` in `lib/marketScan.ts` and `buildScanRows` in
  `lib/scan/publish.ts` are what keep planless results out.
- `42501` / `permission denied` — `SUPABASE_SERVICE_ROLE_KEY` is missing or
  wrong on the deployment. The table is written by the service role only; RLS
  allows reads to signed-in users and nothing else.
- "no setup cleared the protocol with a complete trade plan" — not an error.
  Nothing armed a tradeable trigger today, so the previous day's list is
  deliberately left in place rather than replaced with an empty one.

**The date is old and the button works, but nothing runs unattended.** The
scheduled scan isn't reaching the route:

1. Check Vercel → Project → Cron Jobs for the last run status and logs.
2. `503` means `CRON_SECRET` isn't set on the project. Vercel only attaches
   the `Authorization: Bearer` header when that variable exists, so an unset
   secret makes every scheduled run fail closed — set it in the project's env
   vars and redeploy.
3. `401` means the header didn't match: the deployment's `CRON_SECRET`
   differs from the one the cron was configured with.
4. If nothing fired at all, confirm production is running the deployment you
   expect. `vercel.json` sets `git.deploymentEnabled: true`, so production
   tracks `main` within minutes of a merge — a missing cron usually means the
   last production build failed, not that deploys are off.
5. To test manually:
   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/market-scan
   ```

**The lists are full but the prices look invented** (SPY entering at
$100.00, AMD at $102.00, NVDA at $106.00, every stop exactly $3 below entry).
That is the `daily-scan` Supabase edge function's mock fallback, scheduled by
pg_cron outside this repo and retired by migration `0007`. Confirm the job is
gone before trusting the table:

```sql
select jobname, schedule, active from cron.job;
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

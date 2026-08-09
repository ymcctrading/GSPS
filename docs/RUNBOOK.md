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
That is the `daily-scan` Supabase edge function's mock fallback. Both halves of
it are retired: migration `0007` unscheduled the pg_cron job, and the function
body is now the 410 stub in `supabase/functions/daily-scan/index.ts`. If those
prices reappear, one of the two has been restored — check both:

```sql
select jobname, schedule, active from cron.job;                  -- expect no rows
select count(*) from daily_scans where detail ? 'setupTier';     -- expect 0
```

`detail ? 'setupTier'` is the tell: rows from the edge function carry
`setupTier`/`relativeVolume`/`atrExpansion`, rows from `/api/market-scan` carry
`pattern`/`gann`/`breakdown`.

## The dashboard says the prices are from a previous session

Working as intended. `getDailyScans` returns the newest scan in the table
whatever its age, so `StaleScanNotice` states that age rather than letting a
closed session's levels render like today's. The four price columns are
15-minute-bar levels — an entry a penny beyond a signal candle, a stop a penny
beyond the other side — so they mean nothing outside the session that produced
them, and they look just as precise either way.

- **"From the previous session"** — one session behind. Ordinary before the
  day's scan has run. Press Refresh scan, or wait for the cron.
- **"These prices are N sessions old"** (red) — the scan has not run when it
  should have. Work the cron checklist above; do not trade off the list.

Age is counted in sessions, not calendar days, so a Friday scan does not read
as stale on Saturday. Market holidays are not modelled — a scan taken before
one reads a session staler than it is, which is the safe direction to be wrong.

Both the scan date and "today" are Eastern (`etDateKey` in
`lib/market/session.ts`), not UTC. That matters between 20:00 ET and midnight,
when the two calendars disagree: a post-close re-run dated in UTC would be
filed under tomorrow, and tomorrow would open showing tonight's levels as
current. One definition of the trading day, used by the writer, the reader and
the auto-scan guard alike.

## A direction list has fewer than 15 rows

Expected, not a fault. A row is only published when the execution timeframe
armed a tradeable trigger and the plan priced out — entry, stop, TP1 and
master profit all present. Narrow-range names (bond ETFs, thin tape) routinely
arm nothing, and the four price columns are `NOT NULL` in `daily_scans`, so
there is no way to pad the list with a symbol that has no plan.

When a side comes up short the scan tops it up with momentum continuations:
candidates whose daily range is expanding at least 1.2x its trailing baseline,
still trading on the trend side of their 20-bar mean, that armed a `2-1-2` or
`3-1-2` in the same direction the macro timeframes read. Those rows are tagged
`continuation` in the table and in `detail.setupKind`. The scan response
reports `continuationFills` per direction.

A list that is short *and* got no continuation fills means the continuation
gates found nothing either — a quiet, directionless tape. Check
`shortlisted` and `universeSize` in the scan response before suspecting a
data-provider problem.

Expect short lists to be the norm rather than the exception: the risk floor
sits at `0.75x` the execution-timeframe ATR (`MIN_RISK_ATR_FRACTION`), which
roughly halves the setups that arm at all.

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

Deploys are automatic (`vercel.json` sets `git.deploymentEnabled: true`), so
there is nothing to request — **merging the PR to `main` ships it**, live
within a couple of minutes. What that means in practice:

1. Verify *before* merging, against the PR's preview URL. After the merge
   there is no gate left to catch anything.
2. Merge only when you mean to release. A merge you intended as bookkeeping
   is still a release.
3. After the merge, spot-check `/api/market-scan` (cron auth), one
   market-data route, and the dashboard load before considering it done.

To get a build without shipping it, push the branch and use its preview —
that is what previews are for.

## Rollback

Fastest first: **promote the last good production deployment** from the
Vercel dashboard (Deployments → the previous `Ready` production build →
Promote). It is live in seconds and needs no build, which matters when the
current build is the thing that is broken.

Reverting in git is the durable fix, and redeploys on its own:

```bash
git revert <sha>
git push origin main   # this redeploys production automatically
```

Do both when the bad commit is staying out: promote first to stop the
bleeding, then revert so the next merge doesn't carry it back in.

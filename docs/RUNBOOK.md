# Runbook

Operational checklist for when something in GSPS breaks. This app runs
unattended crons and depends on five external APIs — most incidents trace
back to one of those.

## Dashboard shows no signals, or a stale scan date

`daily_scans` is written by `/api/market-scan`: on a schedule (weekdays,
12:30 UTC via GitHub Actions — `.github/workflows/premarket-scan.yml` — and
21:30 UTC via native Vercel Cron — see `vercel.json`) and by the dashboard's
own Refresh scan button, which POSTs the same route as the signed-in user.

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
scheduled scan isn't reaching the route. Which scheduler to check depends on
which of the two daily runs is missing:

- **21:30 UTC (post-close) missing** → check Vercel → Project → Cron Jobs
  for the last run status and logs.
- **12:30 UTC (pre-market) missing** → check the repo's Actions tab for the
  `Pre-market scan` workflow's run history
  (`.github/workflows/premarket-scan.yml`). A run that fired but failed
  shows the HTTP status and response body in its log.

Either way:

1. `503` means `CRON_SECRET` isn't set where the caller reads it from —
   Vercel project env vars for the native cron, or the `CRON_SECRET` GitHub
   Actions repo secret for the moved one. Vercel only attaches the
   `Authorization: Bearer` header when its variable exists, so an unset
   secret makes that scheduled run fail closed.
2. `401` means the header didn't match: the caller's `CRON_SECRET` differs
   from the one the deployment checks against.
3. If nothing fired at all from Vercel, confirm production is running the
   deployment you expect. `vercel.json` sets `git.deploymentEnabled: true`,
   so production tracks `main` within minutes of a merge — a missing cron
   usually means the last production build failed, not that deploys are off.
   If nothing fired at all from GitHub Actions, confirm the workflow is
   still enabled (Actions → Pre-market scan) — GitHub disables scheduled
   workflows in repos with no activity for 60 days.
4. To test manually:
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
- **"Priced before the … session opened"** — the list is dated today, but the
  run that produced it was the 12:30 UTC cron, which fires at 08:30 ET, an hour
  before the open. The scan reads *closed* 15-minute bars, so at that hour the
  most recent one belongs to the previous session. The levels are real, they are
  just drawn on yesterday's tape and have not seen the overnight session or the
  opening auction. Re-run once the market has been open a while. (The 17:30 ET
  run is also outside market hours but reads that day's bars, so it is not
  flagged.) The check is `pricedBeforeSession`, off `detail.scannedAt`.

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

## Phase 4 — Morning Preparation / Confirmation scheduled scans

`/api/scans/morning-preparation` (6:00 AM ET) and
`/api/scans/morning-confirmation` (9:15 AM ET) are trusted, cron-secret-gated
jobs (`lib/entitlements/scheduled-scan.ts`), invoked by
`.github/workflows/morning-preparation-scan.yml` /
`morning-confirmation-scan.yml` rather than `vercel.json` (both Vercel Hobby
cron slots are already spent — see `docs/THIRD_PARTY_LIMITS.md`).

**Manual invocation** (safe to run any time — every guard below still
applies):

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  https://gsps.vercel.app/api/scans/morning-preparation
```

Or trigger the GitHub Actions workflow directly (Actions tab →
"Morning Preparation scan" / "Morning Confirmation scan" → Run workflow).

**Expected response shapes:**

- `{ "skipped": "preview_environment", ... }` — running against a preview
  deployment; no scan, no writes, no notifications. Expected and correct.
- `{ "skipped": "non_trading_day", ... }` — weekend or a full-day market
  holiday (`lib/market/calendar.ts`). Expected and correct.
- `{ "skipped": "already_run", "scanExecutionId": "...", ... }` — a
  `scan_executions` row already exists for this `(source, market_date_et)`
  pair (migration 0038's partial unique index). This is the idempotency
  guarantee working as designed: a retry, a duplicate GitHub Actions run, or
  a manual re-invocation after a successful run does **not** re-scan,
  re-persist visible results, re-evaluate monitors, or re-send
  notifications. Not an error.
- `{ "source", "marketDateEt", "eligibleCount", "scanExecutionId",
  "profilesFannedOut", "profilesFailed", "totalNotified", ... }` — a real
  run. `profilesFailed` should normally be `0`; a nonzero value means one or
  more profiles' fan-out (visible results / monitors / notifications)
  failed and was logged — check application logs for
  `fan-out failed for profile <id>` around this run's timestamp. The run
  itself still succeeds even if some profiles fail.
- `503` with `{ "error": "Upstream market data unavailable" }` — the market
  scan itself failed (provider outage/timeout). Fails closed: nothing is
  persisted, no stale signal is served. Safe to retry once the provider
  recovers; the next successful call still lands under the same market date.
- `401` — missing/invalid `Authorization` header. Confirms the trusted-job
  gate is not accepting ordinary browser calls.

**Idempotency / retry:** the job/run key is `(source, market_date_et)` where
`market_date_et` is the America/New_York calendar date at call time
(`lib/market/session.ts#etDateKey`), computed correctly across DST since it
reads the wall-clock date in that IANA zone rather than a fixed UTC offset.
Safe to re-run any number of times for the same market date; only the first
successful run does real work.

**Holiday / weekend behavior:** `isTradingDay()` (`lib/market/calendar.ts`)
skips Saturdays, Sundays, and NYSE/Nasdaq full-day closures. Early-close
days (e.g. the day after Thanksgiving) are *not* skipped — the module is
deliberately narrow to full-day closures only.

**Early close is a non-issue for these two jobs specifically, not an
unhandled case:** early close only moves the market's *close* from 4:00 PM
ET to 1:00 PM ET — the open stays 9:30 AM ET on every trading day,
early-close or not. Morning Preparation (6:00 AM ET) and Confirmation
(9:15 AM ET) both run before the open regardless, so neither job's
behavior depends on when the market closes that day; there is nothing
correct to gate on here. This would need real handling only if a future
Phase 4/5 job were added that runs *near or after* close (the existing
17:30 ET `/api/market-scan` post-close cron is the one job in this codebase
that could be affected by an early close, and it predates and is out of
scope for this Phase 4/5 work) — at that point a documented product policy
for what "post-close" means on a 1:00 PM close would actually be needed,
which is why one hasn't been invented here for a case that doesn't apply.

**Observability:** every invocation emits one structured JSON log line
(`event: "scheduled_scan_run"`) covering `runId`, `jobType` (the source),
`marketDateEt`, `environment`, `outcome` (`unauthorized` /
`preview_skip` / `non_trading_day` / `already_run` /
`upstream_unavailable` / `persist_failed` / `completed`), and — on a
completed run — `eligibleCount`/`profilesFannedOut`/`profilesFailed`/
`totalNotified`. `runId` is also echoed in the HTTP response body, so a
support investigation can correlate "what did this specific invocation do"
between the caller's response and the Vercel log stream. `profilesFailed`
nonzero on a `completed` outcome is the signal to grep logs for
`fan-out failed for profile <id>` around that `runId`.

**Monitor invalidation on a scheduled run:** `runMarketScan()` exposes
`fullScanResults` — every symbol that received a full multi-timeframe pass
this run (not just the `bullish`/`bearish` winners), including ones that
armed nothing. `scheduled-scan.ts` builds `rejectedSymbols` from that set
exactly the way `/api/batch-scan/route.ts` builds it from its own scan
results, so a profile's existing Watch/Execute monitor on a symbol this run
scanned and found clean *does* get invalidated — the same rule as a manual
scan. The one case this still can't cover: a symbol the run's reduced
universe (`MORNING_SCAN_UNIVERSE_TOP`/`MORNING_SCAN_PER_SIDE`) never
selected for a full pass at all — that's "not evaluated," not "evaluated
and rejected," and correctly stays untouched rather than being guessed at.
Such a monitor still clears via the user's own manual scans, the 08:30/
17:30 ET `/api/market-scan` crons (full universe), or
`active_monitors.expires_at`.

**Rollback / disable:** disable via the GitHub Actions workflow (Actions →
the workflow → "..." → Disable workflow), or delete/comment out its
`schedule:` trigger. This does not touch `CRON_SECRET` or any other
schedule. No production data needs cleanup — a disabled schedule simply
stops creating new `scan_executions` rows.

## Phase 5 — Watch → Execute monitor & notification delivery

`lib/entitlements/monitor.ts` (pure state-machine decision),
`monitor-store.ts` (database-backed evaluation), and `delivery.ts`
(idempotent delivery ledger + send) implement the WATCH → EXECUTE lifecycle.
`lib/entitlements/scan-fanout.ts` wires them into every scan path
(`/api/batch-scan` and the two scheduled jobs above) identically, so a user-
initiated scan and a scheduled scan apply the same cooldown, re-arm, and
invalidation-precedence rules.

**Expected behavior:**

- A monitor is created WATCH or born directly EXECUTE only for a *visible*
  (post-cap) setup — a qualifying setup the tier's result-visibility cap
  dropped never reaches `evaluateMonitor` and cannot be watched or alerted
  on.
- Notification sends only on a confirmed prior-WATCH → candidate-EXECUTE
  transition (`decideTransition` in `monitor.ts`), never on a monitor born
  directly into EXECUTE.
- Re-arm requires leaving EXECUTE, returning to WATCH, and reconfirming
  EXECUTE before another alert — enforced by `lastExecuteAt` cooldown lookup
  plus the state machine's transition rules, not by application-side timers.
- A newer evaluation (`candidateEvaluatedAt`) never regresses a monitor to
  an older read (`stale_evaluation`), which is what makes out-of-order
  concurrent evaluations (e.g. the 6:00 and 9:15 jobs racing a manual scan)
  safe.

**Cooldown suppression:** every time `evaluateMonitor` declines to apply a
candidate transition (`cooldown` or `stale_evaluation`), it writes the
reason and timestamp onto the monitor row itself
(`active_monitors.last_suppressed_reason` / `last_suppressed_at`, migration
0039) — a suppressed WATCH→EXECUTE flap is recorded, not silently dropped.
A later evaluation that actually applies clears both columns, so a nonzero
value always reflects the *most recent* evaluation's outcome, not stale
history.

**Monitor capacity / fair use:** a tier whose policy limit is
`"unlimited"` (Wall Street) is still capped at
`FAIR_USE_MAX_ACTIVE_MONITORS` (`monitor-store.ts`, currently 1000) — the
spec's "unlimited/fair-use" wording is enforced as a real ceiling, not a
literal absence of one.

**Delivery retry:** `recordNotificationDelivery` inserts a `pending` row
under a unique `idempotency_key` (`<transitionId>:<channel>`), storing the
exact entitled payload it was recorded with. `dispatchNotificationDelivery`
re-reads the row immediately before sending and only proceeds if it is
still `pending` or `failed` (never `sent`), and stops retrying once
`attempt_count` reaches `MAX_DISPATCH_ATTEMPTS` (5). A delivery already
`sent` is never re-sent, by any caller, including the retry sweep below.

A GitHub Actions workflow
(`.github/workflows/notification-delivery-retry.yml`, every 30 minutes on
weekdays) calls `/api/notifications/retry-deliveries`, which sweeps rows
stuck `pending` (the inline dispatch right after evaluation never ran, or
crashed mid-flight) or `failed` (worth another attempt) older than 5
minutes — that age floor exists so the sweep never races the inline
dispatch that follows `recordNotificationDelivery` on the original
evaluation path. Manual invocation:

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  https://gsps.vercel.app/api/notifications/retry-deliveries
```

Response: `{ "swept": N, "sent": N, "failed": N, "suppressed": N }` —
`suppressed` covers preview/no-longer-pending/attempt-ceiling no-ops within
the swept set, not an error.

**Preview:** `dispatchNotificationDelivery` itself checks
`VERCEL_ENV === "preview"` and refuses to send — this is enforced at the
single choke point every send path (the scheduled jobs' inline dispatch,
`/api/batch-scan`'s inline dispatch, and the retry sweep) goes through, not
duplicated per call site. A `pending`/`failed` row is left untouched in
preview rather than mutated, so preview activity never fabricates a
`sent`/`failed` record. No `RESEND_API_KEY` configuration is needed to
guarantee this; it is a hard code-level guard, not an operational
convention to remember.

**Rollback / disable:** to stop all outbound sends without touching schema
or code, unset `RESEND_API_KEY` on the deployment — `sendAlertEmail`
short-circuits to `{ success: false }` and every delivery lands `failed`
rather than silently vanishing (the ledger row still records the attempt).
To stop the retry sweep specifically without touching the inline dispatch
path, disable `.github/workflows/notification-delivery-retry.yml` the same
way as the scan workflows above.

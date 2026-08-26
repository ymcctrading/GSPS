-- Phase 4: durable job idempotency for the 6:00 AM / 9:15 AM ET scheduled
-- scans (scheduled_morning_scan, scheduled_morning_confirmation_scan).
--
-- Additive only. `scan_executions` (0036) had no notion of "which market
-- date this run was for" -- a GitHub Actions retry, a manual re-invocation,
-- or two workflow runs racing each other could each insert a fresh row and
-- silently double-run the scan, double-fan-out visible results, and
-- double-evaluate monitors for every profile. `market_date_et` plus a
-- partial unique index closes that: the *database*, not caller discipline,
-- rejects a second scheduled_* row for a market date + job type that
-- already ran.
--
-- Only meaningful for the two scheduled system jobs (profile_id is null for
-- both) -- user-initiated scans (manual_dashboard, guided, automation,
-- intraday, backtest) never set this column and are unaffected.
--
-- Rollback: `drop index if exists public.scan_executions_scheduled_job_once_idx;
-- alter table public.scan_executions drop column if exists market_date_et;`

alter table public.scan_executions
  add column market_date_et date;

create unique index scan_executions_scheduled_job_once_idx
  on public.scan_executions (source, market_date_et)
  where profile_id is null
    and source in ('scheduled_morning_scan', 'scheduled_morning_confirmation_scan');

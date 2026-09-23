-- Widens scan_executions to allow a third scheduled scan source,
-- 'scheduled_first_90min_scan' -- the 9:45 AM ET scan added alongside the
-- existing 6:00 AM ("scheduled_morning_scan") and 9:15 AM
-- ("scheduled_morning_confirmation_scan") jobs, per the project owner's
-- direct request: "we have a 15 min[ute] delay... run a fresh scan at 9:45
-- to catch the larger moves that occur within the first 90 min[utes] of the
-- market opening."
--
-- Two things need widening, both scoped to exactly the two prior sources:
--
-- 1. scan_executions_source_check (0036, widened by 0062) -- a plain
--    enumeration, so the new value is just added to the list.
-- 2. scan_executions_scheduled_job_once_idx (0040) -- the per-market-date
--    idempotency guard for scheduled jobs, whose WHERE clause hardcodes the
--    two existing sources. Reusing either existing source string for the
--    9:45 job would have it silently skipped as "already run today" the
--    moment the 9:15 job ran -- the whole point of the idempotency guard,
--    just pointed at the wrong granularity. The index has to be dropped and
--    recreated with the third source added, same as 0062 did for the check
--    constraint.
--
-- Additive only -- every previously allowed value and every existing row
-- stays exactly as it was.
--
-- Rollback
-- --------
-- Only safe if no `scan_executions` row has
-- `source = 'scheduled_first_90min_scan'` yet:
--   drop index if exists public.scan_executions_scheduled_job_once_idx;
--   create unique index scan_executions_scheduled_job_once_idx
--     on public.scan_executions (source, market_date_et)
--     where profile_id is null
--       and source in ('scheduled_morning_scan', 'scheduled_morning_confirmation_scan');
--   alter table public.scan_executions drop constraint scan_executions_source_check;
--   alter table public.scan_executions add constraint scan_executions_source_check
--     check (source in (
--       'manual_dashboard', 'guided', 'automation', 'intraday', 'backtest',
--       'scheduled_morning_scan', 'scheduled_morning_confirmation_scan',
--       'single_ticker'
--     ));

alter table public.scan_executions
  drop constraint if exists scan_executions_source_check;

alter table public.scan_executions
  add constraint scan_executions_source_check
  check (source in (
    'manual_dashboard', 'guided', 'automation', 'intraday', 'backtest',
    'scheduled_morning_scan', 'scheduled_morning_confirmation_scan',
    'single_ticker', 'scheduled_first_90min_scan'
  ));

drop index if exists public.scan_executions_scheduled_job_once_idx;

create unique index scan_executions_scheduled_job_once_idx
  on public.scan_executions (source, market_date_et)
  where profile_id is null
    and source in (
      'scheduled_morning_scan', 'scheduled_morning_confirmation_scan',
      'scheduled_first_90min_scan'
    );

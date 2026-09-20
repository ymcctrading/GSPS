-- Widens scan_executions and active_monitors to allow two new scheduled
-- scan sources, 'scheduled_midday_scan' (~11:00 AM ET) and
-- 'scheduled_afternoon_scan' (~2:00 PM ET) -- added to close the coverage
-- gap between the 9:45 AM first-90min scan and the 5:30 PM post-close run,
-- during which no full-universe scan ran at all. Also adds
-- 'scheduled_invalidation_sweep' (active_monitors only), the twice-hourly
-- live stop-check that transitions a tracked monitor to INVALIDATED between
-- full scans without running a full rescan. Project owner direction,
-- 2026-09-17.
--
-- Three things widened, following the exact precedent of 0062 (single_ticker)
-- and 0068 (scheduled_first_90min_scan):
--
-- 1. scan_executions_source_check -- a plain enumeration, so the two new
--    scan sources are added to the list. scheduled_invalidation_sweep does
--    NOT write a scan_executions row (it's not a scan_executions-shaped
--    run -- see app/api/monitors/invalidation-sweep/route.ts), so it is not
--    added here.
-- 2. scan_executions_scheduled_job_once_idx -- the per-market-date
--    idempotency guard for scheduled jobs, whose WHERE clause hardcodes
--    every eligible source. Reusing an existing source string for either
--    new job would have it silently skipped as "already run today" the
--    moment an earlier job of that source ran.
-- 3. active_monitors_source_check -- widened to add the two new scan
--    sources AND scheduled_invalidation_sweep. This also fixes a
--    pre-existing bug: 0036's original active_monitors check constraint
--    was never widened when 0062 added 'single_ticker' and 0068 added
--    'scheduled_first_90min_scan' to scan_executions -- only the
--    scan_executions constraint was touched by either migration. Every
--    evaluateMonitor() call with source: "single_ticker" (app/api/scan)
--    or source: "scheduled_first_90min_scan" (the 9:45 AM job, live since
--    0068) has been failing its active_monitors insert/update on this
--    constraint ever since. Both are added here alongside the two new
--    sources, closing the gap rather than compounding it while this exact
--    constraint is already being touched.
--
-- Additive only -- every previously allowed value and every existing row
-- stays exactly as it was.
--
-- Rollback
-- --------
-- Only safe if no `scan_executions` row has source in
-- ('scheduled_midday_scan', 'scheduled_afternoon_scan') and no
-- `active_monitors` row has source in ('single_ticker',
-- 'scheduled_first_90min_scan', 'scheduled_midday_scan',
-- 'scheduled_afternoon_scan', 'scheduled_invalidation_sweep'):
--   drop index if exists public.scan_executions_scheduled_job_once_idx;
--   create unique index scan_executions_scheduled_job_once_idx
--     on public.scan_executions (source, market_date_et)
--     where profile_id is null
--       and source in (
--         'scheduled_morning_scan', 'scheduled_morning_confirmation_scan',
--         'scheduled_first_90min_scan'
--       );
--   alter table public.scan_executions drop constraint scan_executions_source_check;
--   alter table public.scan_executions add constraint scan_executions_source_check
--     check (source in (
--       'manual_dashboard', 'guided', 'automation', 'intraday', 'backtest',
--       'scheduled_morning_scan', 'scheduled_morning_confirmation_scan',
--       'single_ticker', 'scheduled_first_90min_scan'
--     ));
--   alter table public.active_monitors drop constraint active_monitors_source_check;
--   alter table public.active_monitors add constraint active_monitors_source_check
--     check (source in (
--       'manual_dashboard', 'guided', 'automation', 'intraday',
--       'scheduled_morning_scan', 'scheduled_morning_confirmation_scan'
--     ));

alter table public.scan_executions
  drop constraint if exists scan_executions_source_check;

alter table public.scan_executions
  add constraint scan_executions_source_check
  check (source in (
    'manual_dashboard', 'guided', 'automation', 'intraday', 'backtest',
    'scheduled_morning_scan', 'scheduled_morning_confirmation_scan',
    'single_ticker', 'scheduled_first_90min_scan',
    'scheduled_midday_scan', 'scheduled_afternoon_scan'
  ));

drop index if exists public.scan_executions_scheduled_job_once_idx;

create unique index scan_executions_scheduled_job_once_idx
  on public.scan_executions (source, market_date_et)
  where profile_id is null
    and source in (
      'scheduled_morning_scan', 'scheduled_morning_confirmation_scan',
      'scheduled_first_90min_scan', 'scheduled_midday_scan',
      'scheduled_afternoon_scan'
    );

alter table public.active_monitors
  drop constraint if exists active_monitors_source_check;

alter table public.active_monitors
  add constraint active_monitors_source_check
  check (source in (
    'manual_dashboard', 'guided', 'automation', 'intraday',
    'scheduled_morning_scan', 'scheduled_morning_confirmation_scan',
    'single_ticker', 'scheduled_first_90min_scan',
    'scheduled_midday_scan', 'scheduled_afternoon_scan',
    'scheduled_invalidation_sweep'
  ));

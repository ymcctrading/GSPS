-- Adds 'scheduled_full_universe_scan' as a valid scan_executions/
-- active_monitors source -- the fan-out this migration enables for
-- /api/market-scan's cron path (app/api/market-scan/route.ts), closing the
-- gap ROADMAP.md's "Scan history" note names explicitly: the system-scan
-- (cron) path had no per-profile monitor evaluation at all, so a symbol
-- only ever seen through that route could sit on a user's Scan History tab
-- as permanently "untracked" even after becoming a real Execute setup.
--
-- Deliberately NOT added to scan_executions_scheduled_job_once_idx (0040,
-- widened by 0070): that index makes a source's scan_executions row
-- idempotent per (source, market_date_et) -- correct for the five
-- scheduled_* jobs, which each run once at a fixed time of day, but wrong
-- here. /api/market-scan's cron runs continuously (.github/workflows/
-- full-market-scan.yml, every 15 minutes through the session) specifically
-- to keep publishing fresh daily_scans all day (see that route's own header
-- comment) -- forcing it into "one scan_executions row per day" would make
-- every run after the first silently no-op its fan-out. Each cron
-- invocation gets its own scan_executions row instead; evaluateMonitor's
-- own cooldown (lib/entitlements/monitor.ts, DEFAULT_COOLDOWN_MS) is what
-- keeps repeated same-state re-evaluations from flapping or over-notifying,
-- the same protection every other repeated-scan path in this codebase
-- already relies on.
--
-- Additive only -- every previously allowed value and every existing row
-- stays exactly as it was.
--
-- Rollback
-- --------
-- Only safe if no `scan_executions` row and no `active_monitors` row has
-- source = 'scheduled_full_universe_scan':
--   alter table public.scan_executions drop constraint scan_executions_source_check;
--   alter table public.scan_executions add constraint scan_executions_source_check
--     check (source in (
--       'manual_dashboard', 'guided', 'automation', 'intraday', 'backtest',
--       'scheduled_morning_scan', 'scheduled_morning_confirmation_scan',
--       'single_ticker', 'scheduled_first_90min_scan',
--       'scheduled_midday_scan', 'scheduled_afternoon_scan'
--     ));
--   alter table public.active_monitors drop constraint active_monitors_source_check;
--   alter table public.active_monitors add constraint active_monitors_source_check
--     check (source in (
--       'manual_dashboard', 'guided', 'automation', 'intraday',
--       'scheduled_morning_scan', 'scheduled_morning_confirmation_scan',
--       'single_ticker', 'scheduled_first_90min_scan',
--       'scheduled_midday_scan', 'scheduled_afternoon_scan',
--       'scheduled_invalidation_sweep'
--     ));

alter table public.scan_executions
  drop constraint if exists scan_executions_source_check;

alter table public.scan_executions
  add constraint scan_executions_source_check
  check (source in (
    'manual_dashboard', 'guided', 'automation', 'intraday', 'backtest',
    'scheduled_morning_scan', 'scheduled_morning_confirmation_scan',
    'single_ticker', 'scheduled_first_90min_scan',
    'scheduled_midday_scan', 'scheduled_afternoon_scan',
    'scheduled_full_universe_scan'
  ));

alter table public.active_monitors
  drop constraint if exists active_monitors_source_check;

alter table public.active_monitors
  add constraint active_monitors_source_check
  check (source in (
    'manual_dashboard', 'guided', 'automation', 'intraday',
    'scheduled_morning_scan', 'scheduled_morning_confirmation_scan',
    'single_ticker', 'scheduled_first_90min_scan',
    'scheduled_midday_scan', 'scheduled_afternoon_scan',
    'scheduled_invalidation_sweep', 'scheduled_full_universe_scan'
  ));

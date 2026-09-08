-- Widens `scan_executions.source` to allow `'single_ticker'`.
--
-- docs/GSPS_TIER_ENTITLEMENT_SPEC.md's "Eligible monitor sources" list
-- names six sources, one of them "Manually requested single-ticker scans,
-- subject to monitor capacity" — but migration 0036's original check
-- constraint only ever allowed 'manual_dashboard', 'guided', 'automation',
-- 'intraday', 'backtest', 'scheduled_morning_scan', and
-- 'scheduled_morning_confirmation_scan'. `/api/scan` (the single-ticker
-- route) could not have recorded a `scan_executions` row under its own
-- source even if something had tried to write one, which is one reason
-- nothing did: see app/api/scan/route.ts, now wired to call
-- `evaluateMonitor` with `source: "single_ticker"` after this migration.
--
-- Additive only — every previously allowed value stays allowed, so no
-- existing row is affected.
--
-- Rollback
-- --------
-- Only safe if no `scan_executions` row has `source = 'single_ticker'` yet:
--   alter table public.scan_executions drop constraint scan_executions_source_check;
--   alter table public.scan_executions add constraint scan_executions_source_check
--     check (source in (
--       'manual_dashboard', 'guided', 'automation', 'intraday', 'backtest',
--       'scheduled_morning_scan', 'scheduled_morning_confirmation_scan'
--     ));

alter table public.scan_executions
  drop constraint if exists scan_executions_source_check;

alter table public.scan_executions
  add constraint scan_executions_source_check
  check (source in (
    'manual_dashboard', 'guided', 'automation', 'intraday', 'backtest',
    'scheduled_morning_scan', 'scheduled_morning_confirmation_scan',
    'single_ticker'
  ));

-- 2026-09-14's weight rebalance (lib/scoring/weights.ts) made
-- DEFAULT_CRITERION_WEIGHTS a hand-set, non-uniform distribution, so
-- `decision.score` has been fractional (e.g. 5.61) rather than a whole number
-- ever since -- and 2026-09-16's tenth criterion (`ruleOfThree`) raised
-- TOTAL_POINTS from 9 to 10. Three tables still store the raw score as
-- `int ... check (score between 0 and 9)`, a shape that predates both changes:
--
--   - `daily_scans.score` (0001) -- lib/scan/publish.ts inserts
--     `r.decision.score` unrounded. This is the column that broke first: the
--     dashboard's "Refresh scan" started failing with
--     `invalid input syntax for type integer: "5.61"` the moment a scored
--     setup carried a fractional score, rejecting the whole batch (see
--     lib/scan/publish.ts's header on the all-or-nothing insert).
--   - `scan_results.score` (0001) -- app/api/batch-scan/route.ts's history
--     write (0044) has the identical shape and would fail the same way the
--     next time a batch scan writes a fractional score.
--   - `coarse_gate_telemetry.full_scan_score` (0019) -- lib/marketScan.ts
--     writes the same unrounded `decision.score`. This one fails silently
--     (persistCoarseTelemetry only console.warns, per
--     app/api/market-scan/route.ts), which is worse, not better.
--
-- `lib/learning/record.ts` already hit this and chose to round-and-clamp for
-- its own `int` column, keeping the exact figure in a jsonb `detail` column
-- instead -- deliberate, since that table trains a model that should not
-- overweight noise past two decimal places. These three columns are
-- different: `daily_scans`/`scan_results` are what a user reads directly
-- (`components/scan/score-badge.tsx` renders the raw number), and
-- `coarse_gate_telemetry` exists specifically to calibrate real backtest
-- attribution against the exact score a symbol got -- rounding either away
-- would throw away the precision the column exists to capture. So these
-- three take the other fix: widen the column to `numeric` and raise the
-- range check from 9 to `TOTAL_POINTS` (10, `lib/scoring/weights.ts`).
--
-- Per AGENTS.md's cross-platform-consistency principle: this is the same
-- underlying defect (a column sized for the old whole-number, nine-point
-- score) surfacing on every table that stores the raw score, not three
-- unrelated bugs -- fixing only `daily_scans` would leave the identical
-- failure live in `scan_results` and silently live in `coarse_gate_telemetry`.
--
-- Rollback: `alter table public.daily_scans alter column score type int using round(score), drop constraint if exists daily_scans_score_check, add constraint daily_scans_score_check check (score between 0 and 9); alter table public.scan_results alter column score type int using round(score), drop constraint if exists scan_results_score_check, add constraint scan_results_score_check check (score between 0 and 9); alter table public.coarse_gate_telemetry alter column full_scan_score type int using round(full_scan_score), drop constraint if exists coarse_gate_telemetry_full_scan_score_check, add constraint coarse_gate_telemetry_full_scan_score_check check (full_scan_score is null or full_scan_score between 0 and 9);`
-- (lossy -- only safe once nothing written since this migration needs the fractional precision back.)

alter table public.daily_scans
  alter column score type numeric using score::numeric;
alter table public.daily_scans
  drop constraint if exists daily_scans_score_check;
alter table public.daily_scans
  add constraint daily_scans_score_check check (score between 0 and 10);

alter table public.scan_results
  alter column score type numeric using score::numeric;
alter table public.scan_results
  drop constraint if exists scan_results_score_check;
alter table public.scan_results
  add constraint scan_results_score_check check (score between 0 and 10);

alter table public.coarse_gate_telemetry
  alter column full_scan_score type numeric using full_scan_score::numeric;
alter table public.coarse_gate_telemetry
  drop constraint if exists coarse_gate_telemetry_full_scan_score_check;
alter table public.coarse_gate_telemetry
  add constraint coarse_gate_telemetry_full_scan_score_check
  check (full_scan_score is null or full_scan_score between 0 and 10);

-- active_monitors.score (migration 0069) was added as
-- `int check (score is null or score between 0 and 9)`, the same shape that
-- broke daily_scans/scan_results/coarse_gate_telemetry in migration 0073
-- (`invalid input syntax for type integer`) -- see that migration's header
-- for the full history of the 2026-09-14 weight rebalance making
-- `decision.score` fractional by design.
--
-- That column sat unwritten until lib/entitlements/scan-fanout.ts's
-- evaluateMonitorsAndNotify was wired (alongside migration 0071's trade-plan
-- columns) to pass `score: setup.value.decision.score` into
-- lib/entitlements/monitor-store.ts's evaluateMonitor on every WATCH/EXECUTE
-- insert and update -- so the identical defect that broke the dashboard's
-- Refresh scan is now live on the Watch -> Execute monitor pipeline itself:
-- every monitor write for a fractional score fails, the failure is caught
-- and only console.error'd (lib/entitlements/scan-fanout.ts's per-setup
-- try/catch), and the visible symptom is trade plans not being created,
-- notifications not firing, and both app/api/scan-history/route.ts's "now"
-- column and lib/dashboard/trackedExecute.ts silently missing rows.
--
-- Per AGENTS.md's cross-platform-consistency principle: this is the same
-- underlying defect surfacing on a fourth table, not a new one. Same fix as
-- 0073 -- widen to numeric, raise the range check to match
-- lib/scoring/weights.ts's TOTAL_POINTS-independent ceiling (10, covering
-- both the nine- and ten-criterion configurations this codebase has run
-- under).
--
-- Rollback: `alter table public.active_monitors alter column score type int using round(score), drop constraint if exists active_monitors_score_check, add constraint active_monitors_score_check check (score is null or score between 0 and 9);`
-- (lossy -- only safe once nothing written since this migration needs the fractional precision back.)

alter table public.active_monitors
  alter column score type numeric using score::numeric;
alter table public.active_monitors
  drop constraint if exists active_monitors_score_check;
alter table public.active_monitors
  add constraint active_monitors_score_check check (score is null or score between 0 and 10);

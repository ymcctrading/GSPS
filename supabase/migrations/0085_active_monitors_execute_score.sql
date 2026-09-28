-- The score and verdict a monitor had when it entered EXECUTE, so the Home
-- dashboard's "Your tracked Execute setups" card can show "score then ->
-- score now" the way saved setups do. `score`/`output_state` keep being
-- overwritten by every evaluation (the live read); these two are written only
-- when a scored evaluation moves the monitor into EXECUTE
-- (lib/entitlements/monitor-store.ts#evaluateMonitor). Null for a monitor that
-- entered EXECUTE before this migration, or only through an unscored source.
alter table public.active_monitors
  add column execute_score numeric check (execute_score is null or execute_score between 0 and 10),
  add column execute_output_state text check (
    execute_output_state is null or execute_output_state in ('Execute', 'Watch', 'Reject')
  );

-- GSPS: keep 30 days of pg_cron run history (2026-11-09, coordinator, from the
-- scheduled-jobs review in /mnt/project-files/owner/scheduled-jobs-during-pause.md).
--
-- NOT APPLIED. Adding a schedule changes production, so this waits on the
-- owner's word (waiting-on-chuck.md, Nov 30, beside 0144). Merging this file
-- is not applying it.
--
-- Why: no job trims cron.job_run_details. At 2026-11-09 09:28 UTC it held
-- 13,684 rows (2.5 MB, about 190 bytes a row), all but 10 written since
-- Oct 19, growing about 580 rows a day (about 3.3 MB a month). Small against
-- the 500 MB free tier, but it never stops.
--
-- What reads the history, and why 30 days clears it (grep of lib/, app/,
-- scripts/, docs/ and .github/ found no code that reads it):
--   - the runbook's checks (scripts/after-pause-recovery.mjs "sql"): the last
--     five runs of one job;
--   - by-hand measurements, such as 0143's "7 days to 2026-11-04" call count.
-- The figure is an engineering choice sized to those readers, not a Gann rule
-- (lib/ops/retention.ts, CRON_HISTORY_RETENTION_DAYS, which the test holds
-- this file to).
--
-- A returning cycle, not a drain ("Cycles as architecture"): each run deletes
-- by age, so a missed week is caught by the next and a rerun deletes nothing.
-- Weekly on Sunday at 09:40 UTC, after evaluation-ledger-retention (09:30).
--
-- What it would remove (dry query, run 2026-11-09 09:28 UTC: 10 of 13,684
-- rows, the July and August strays; from Nov 18 on it trims the October rows):
--   select count(*) from cron.job_run_details
--    where end_time < now() - interval '30 days';
--
-- Rollback:
--   select cron.unschedule('gsps-cron-history-retention');
--   drop function if exists gsps_ops.prune_cron_history();

create or replace function gsps_ops.prune_cron_history()
returns integer
language plpgsql
security invoker
set search_path = cron, pg_temp
as $fn$
declare
  removed integer;
begin
  delete from cron.job_run_details where end_time < now() - interval '30 days';
  get diagnostics removed = row_count;
  return removed;
end;
$fn$;

revoke execute on function gsps_ops.prune_cron_history() from public, anon, authenticated;

select cron.schedule('gsps-cron-history-retention', '40 9 * * 0', $$select gsps_ops.prune_cron_history()$$);

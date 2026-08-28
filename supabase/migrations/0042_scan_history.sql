-- Links public.scan_results (per-user on-demand scans, migration 0001) back
-- to its scan_executions row (migration 0036) so a batch of manual-dashboard
-- results can be grouped by the run that produced them, the same way
-- visible_scan_results already is. scan_results has existed since 0001 but
-- nothing ever wrote to it -- see app/api/batch-scan/route.ts's new write,
-- which starts populating it for the Scanner page's "History" tab.
--
-- Nullable and on delete set null: a scan_results row is a user's own record
-- of what a scan told them, and stays meaningful on its own (score,
-- output_state, levels) even if the execution row it grouped under is ever
-- pruned -- the grouping is a convenience, not the row's reason to exist.
--
-- Rollback: `alter table public.scan_results drop column if exists
-- scan_execution_id; drop index if exists public.scan_results_execution_idx;`

alter table public.scan_results
  add column scan_execution_id uuid references public.scan_executions (id) on delete set null;

create index scan_results_execution_idx
  on public.scan_results (scan_execution_id);

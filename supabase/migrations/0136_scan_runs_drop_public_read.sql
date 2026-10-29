-- Q2 item 7, "Scale safely": the Supabase advisor's last
-- multiple_permissive_policies warning (docs/SCALE_AUDIT.md, 2026-10-22).
--
-- `scan_runs` was created from the dashboard on 2026-07-21
-- (gsps_revenue_ledger_and_scan_runs) and given two SELECT policies: one for
-- signed-in members and, the next day, "scan_runs public read" (qual true,
-- gsps_public_read_scan_tables), which lets the anonymous key read it too.
-- Two permissive policies are evaluated on every read, and the second makes
-- the first meaningless. Its writer, the mock daily-scan cron, was retired on
-- 2026-08-05 (its last row is 2026-08-04), and nothing in the app reads it
-- (grep of lib/, app/, components/ on 2026-10-28). So the public policy goes
-- and the member read stays, as for the other scan tables.
--
-- Rollback:
--   create policy "scan_runs public read" on public.scan_runs for select using (true);

drop policy if exists "scan_runs public read" on public.scan_runs;

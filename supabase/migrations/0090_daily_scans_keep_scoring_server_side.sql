-- Keep the scoring model off the public read of daily_scans (review R-021).
--
-- Production carries a policy no migration created, "daily_scans public read"
-- (SELECT, qual true, every role), beside 0001's authenticated-only one. With
-- it, anyone holding the public anon key reads every published row, and each
-- row's `detail` held the score breakdown (every check, its pillar and its
-- note, 18 items on 2026-10-20) and the Gann readings (fan lines, Square of
-- 9, cycle dates). lib/scoring/public-summary.ts keeps the breakdown
-- server-side on every other surface. lib/scan/publish.ts now writes only the
-- per-pillar rollup (`scoreSummary`) and a `retired` flag; this strips the
-- rest from rows already written and drops the out-of-band policy. Nothing in
-- the app reads daily_scans as anon: the dashboard reads through the signed-in
-- server client and the jobs through the service role.
--
-- Rows written before this lose their stored rollup (it can't be rebuilt in
-- SQL); the dashboard reads only the newest scan date, which the next run
-- rewrites.
--
-- Rollback: recreate the policy with
--   create policy "daily_scans public read" on public.daily_scans for select using (true);
-- The stripped JSON keys cannot be restored.
drop policy if exists "daily_scans public read" on public.daily_scans;

update public.daily_scans
set detail = (detail - 'breakdown' - 'gann' - 'armedPatterns')
  || jsonb_build_object(
    'retired',
    coalesce(
      (
        select bool_or(item->>'key' = 'stopBreach' and (item->>'passed')::boolean = false)
        from jsonb_array_elements(case when jsonb_typeof(detail->'breakdown') = 'array' then detail->'breakdown' else '[]'::jsonb end) item
      ),
      false
    )
  )
where detail ? 'breakdown' or detail ? 'gann' or detail ? 'armedPatterns';

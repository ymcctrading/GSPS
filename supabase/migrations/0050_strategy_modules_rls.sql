-- 0048 created public.strategy_modules but never enabled row level security
-- on it -- every sibling table added in that migration (gann_evaluations,
-- sara_evaluations) does, and the database linter flags the miss as RLS
-- Disabled in Public (ERROR). The table is a small static registry (two rows
-- today, see 0048's seed insert) that the app reads to show which confluence
-- modules are active -- there is no per-user data in it, so a public read
-- policy is the right shape, matching the posture 20260722214501
-- (gsps_public_read_scan_tables) already uses for other read-only registry
-- tables. Writes stay service_role-only (no insert/update/delete policy).
--
-- Rollback: `drop policy if exists "public read strategy modules" on
-- public.strategy_modules; alter table public.strategy_modules disable row
-- level security;`

alter table public.strategy_modules enable row level security;

create policy "public read strategy modules" on public.strategy_modules
  for select using (true);

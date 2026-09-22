-- Adds `updated_at` to `daily_scans`, so a reader can tell when a row was last
-- written by a scan run, not just when its (scan_date, direction, rank) slot
-- was first ever filled. `created_at` (0001) doesn't answer this: the upsert
-- in lib/scan/publish.ts's persistDailyScans targets the same
-- (scan_date, direction, rank) key on every run of the day, and a Postgres
-- ON CONFLICT DO UPDATE only touches columns present in the write — since
-- `created_at` was never part of that payload, it silently kept the first
-- insert's timestamp across every later run.
--
-- This is what /api/market-scan's manual-refresh debounce (2026-09-22, see
-- that route's own comment) reads to decide whether a just-finished
-- autonomous 15-minute run already covers "right now" closely enough that a
-- second full 700-symbol scan would be redundant work for the same answer.
--
-- Rollback: `alter table public.daily_scans drop column if exists updated_at;`

alter table public.daily_scans
  add column updated_at timestamptz not null default now();

-- Backfill existing rows so the column isn't null-equivalent-via-default only
-- for rows written before this migration; created_at is the best available
-- approximation for a row's last-known write time until the next scan run.
update public.daily_scans set updated_at = created_at;

create index daily_scans_updated_at_idx on public.daily_scans (scan_date, updated_at desc);

-- GSPS — 0122: when each stored crypto series was last read whole
--
-- Review follow-up to 0121 (2026-10-23). The store re-reads only the two
-- newest stored bars live, so a correction Alpaca makes to an older bar would
-- be carried until it left the window. Each series is now read whole again
-- once a day (lib/data/closedBarsStore.ts, WHOLE_READ_MS). Rows written before
-- this column existed read as never read whole, so they are read whole once.
--
-- Forward-only.
--
-- Rollback:
--   alter table public.closed_bars drop column if exists whole_at;

alter table public.closed_bars
  add column if not exists whole_at timestamptz not null default 'epoch';

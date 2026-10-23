-- GSPS — 0121: closed crypto bars, kept between market scans
--
-- Production bug, 2026-10-23. The market scan's crypto pass read 30 days of
-- hourly bars (46 pages) and 7 days of 15-minute bars (15 pages) for its 12
-- pairs on every run, on the background lane, and missed its 42 s deadline at
-- 12:30 UTC (+72.6 s) and 13:00 UTC (+43.0 s), so the lists carried no crypto.
-- A closed bar never changes and crypto bars carry no split adjustment: each
-- read takes the stored closed bars and fetches live only from the last two
-- of them (lib/data/closedBarsStore.ts). Each row is rewritten on every read.
--
-- Server-only: written and read with the service role. RLS on, no policy.
--
-- Forward-only.
--
-- Rollback:
--   drop table if exists public.closed_bars;

create table if not exists public.closed_bars (
  timeframe text not null check (timeframe in ('15Min', '1Hour')),
  symbol text not null,
  -- The start of the window the bars were read from.
  from_ts timestamptz not null,
  -- [[epoch seconds, open, high, low, close, volume], ...], oldest first, closed bars only.
  bars jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (timeframe, symbol)
);

alter table public.closed_bars enable row level security;

-- GSPS — 0120: closed monthly bars, shared by every instance for the month
--
-- Production bug, 2026-10-23. Alpaca cuts a bars page by the history it reads,
-- so the market scan's monthly read of 250 stocks back to 2016 took 39 pages
-- and 39.7 s on every run, landed after the coarse pass (yearly-cycle re-rank
-- skipped) and held the rate-limit tokens the crypto pass needed. A closed
-- month never changes: the first read of a stock in a New York month stores
-- its closed months here, and later reads fetch only the last two months live
-- (lib/data/monthlyStore.ts). Rows of earlier months are deleted on the next
-- month's first write.
--
-- Server-only: written and read with the service role. RLS on, no policy.
--
-- Forward-only.
--
-- Rollback:
--   drop table if exists public.monthly_bars_closed;

create table if not exists public.monthly_bars_closed (
  -- The New York month the bars were read in (YYYY-MM); they are the months closed before it.
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  symbol text not null,
  -- [[epoch seconds, open, high, low, close, volume], ...], oldest first, split-adjusted.
  bars jsonb not null,
  created_at timestamptz not null default now(),
  primary key (month, symbol)
);

alter table public.monthly_bars_closed enable row level security;

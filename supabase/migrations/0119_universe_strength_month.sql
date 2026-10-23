-- GSPS — 0119: the universe strength rank's monthly read, shared by every instance
--
-- Production bug, 2026-10-23. Gann's relative strength rank (S6,
-- lib/gann/universeStrength.ts) reads the scan universe's monthly bars: 832
-- symbols, which Alpaca returned in 33 pages that night. Each server instance
-- read it once per ET day, inside its first scan, beside the scan's own reads,
-- and the 00:35 UTC evening scan failed waiting for rate-limit tokens. The
-- reading for month M uses only the months closed before M, so it is the same
-- all month: the first instance to read it in a month stores it here and every
-- other instance reads this row instead (lib/data/universeStrength.ts).
--
-- Server-only: written and read with the service role. RLS on, no policy.
--
-- Forward-only.
--
-- Rollback:
--   drop table if exists public.universe_strength_months;

create table if not exists public.universe_strength_months (
  -- The New York month the read was made in (YYYY-MM).
  month text primary key check (month ~ '^\d{4}-\d{2}$'),
  -- { "YYYY-MM": { "SYMBOL": position, ... }, ... }: every reading month the read built.
  readings jsonb not null,
  symbols integer not null,
  created_at timestamptz not null default now()
);

alter table public.universe_strength_months enable row level security;

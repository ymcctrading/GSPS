-- GSPS — 0110: the overnight universe sweep
--
-- Owner, 2026-10-22: "executable setups are what we want to push FIRST." DE
-- read 7 of 9, Execute, on its own page and never reached the Dashboard: the
-- market scan scores in full only the stocks its coarse pre-filter passes
-- (45-125 a day), and that filter had dropped DE every day since Oct 15. The
-- overnight sweep (/api/universe-sweep, lib/scan/universeSweep.ts) scores the
-- whole scan universe with the same score a manual scan gives and stores each
-- verdict here; the next day's market scan re-scores the best of them first.
--
-- Server-only: written and read with the service role. RLS is on with no
-- policy, so no member can read or write it directly.
--
-- Scheduled from the database like every other job: every five minutes from
-- 05:00 to 07:55 UTC, Tuesday to Saturday (1-4 AM New York in summer, midnight
-- to 3 AM in winter), after midnight following each weekday session. Each call
-- scores the stocks not yet stored for the day, so a missed call is made up by
-- the next. Until the route is deployed the call returns 404 and nothing
-- happens.
--
-- Forward-only.
--
-- Rollback:
--   select cron.unschedule('gsps-universe-sweep');
--   drop table if exists public.universe_sweep;

create table if not exists public.universe_sweep (
  basis_date date not null,
  symbol text not null,
  direction text,
  score numeric,
  output_state text,
  setup_kind text,
  entry numeric,
  error text,
  swept_at timestamptz not null default now(),
  primary key (basis_date, symbol)
);

create index if not exists universe_sweep_basis_state_idx on public.universe_sweep (basis_date desc, output_state);

alter table public.universe_sweep enable row level security;

select cron.schedule('gsps-universe-sweep', '*/5 5-7 * * 2-6', $$select gsps_ops.call_endpoint('/api/universe-sweep')$$);

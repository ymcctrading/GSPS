-- GSPS — 0098: the intraday focus list
--
-- Owner, 2026-10-21: "lets take the equities that are deemed to be highly
-- likely setups ... and track those. The intraday scan would have less
-- equities to parse through ... invalidate and replace them with executable
-- moves throughout the day." The evening job (/api/intraday-focus) reads the
-- scan universe's daily charts and stores the stocks primed for the next
-- session, ranked, with the reasons (lib/scanner/focusList.ts). The intraday
-- scan times the top of the list; a name whose daily plan's stop breaks is
-- marked invalidated and the next one takes its place.
--
-- Server-only: written and read with the service role. RLS is on with no
-- policy, so no member can read or write it directly.
--
-- Scheduled from the database like every other job (0089): weekdays 22:00 UTC
-- (6 PM New York in summer, 5 PM in winter), after the close. Until the route
-- is deployed the call returns 404 and nothing happens.
--
-- Forward-only.
--
-- Rollback:
--   select cron.unschedule('gsps-intraday-focus');
--   drop table if exists public.intraday_focus;

create table if not exists public.intraday_focus (
  basis_date date not null,
  symbol text not null,
  rank integer not null,
  reasons jsonb not null,
  close numeric not null,
  avg_dollar_volume numeric not null,
  built_at timestamptz not null default now(),
  invalidated_at timestamptz,
  invalidated_reason text,
  primary key (basis_date, symbol)
);

create index if not exists intraday_focus_basis_rank_idx on public.intraday_focus (basis_date desc, rank);

alter table public.intraday_focus enable row level security;

select cron.schedule('gsps-intraday-focus', '0 22 * * 1-5', $$select gsps_ops.call_endpoint('/api/intraday-focus')$$);

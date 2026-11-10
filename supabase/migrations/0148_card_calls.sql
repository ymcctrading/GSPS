-- GSPS — 0148: daily trade cards and their forward record
--
-- Owner, 2026-11-10: publish setup cards (entry, stop, first target) that have
-- a real chance to be profitable, and log every card, losses included. The
-- evening job (/api/cards/nightly, lib/cards/cardCalls.ts) reads the scan
-- universe's daily charts, builds each daily strategy mode's long cards for
-- the next session, and scores the earlier ones: after the fill, TP1 before
-- the stop is a good call, the stop first a bad call, no fill counted apart
-- (lib/shadow/goodCall.ts). Every kind is recorded; `published` marks the
-- kinds whose held-out record passed (lib/setups/cardRecords.ts), the only
-- ones a member is shown.
--
-- Server-only: written and read with the service role (the members' route
-- reads it for them). RLS is on with no policy.
--
-- Closed rows are the record and are never deleted by the app (AGENTS.md
-- ledger rule); the unpublished kinds' rows are kept the same way.
--
-- Scheduled from the database like every other job (0089, 0144): weekdays
-- 22:20 UTC (6:20 PM New York in summer, 5:20 PM in winter), after the close
-- and after the intraday focus list (22:00). Until the site answers, the call
-- fails and nothing happens; a missed night is rebuilt from the charts the
-- next (the job reads the bars, not a counter).
--
-- Rollback:
--   select cron.unschedule('gsps-card-calls');
--   drop table if exists public.card_calls;

create table if not exists public.card_calls (
  id bigint generated always as identity primary key,
  kind text not null,
  symbol text not null,
  signal_date date not null,
  entry numeric not null,
  stop numeric not null,
  tp1 numeric not null,
  published boolean not null default false,
  session_date date,
  fill_price numeric,
  call_outcome text not null default 'pending'
    check (call_outcome in ('pending', 'good', 'bad', 'open', 'no_fill')),
  created_at timestamptz not null default now(),
  checked_at timestamptz,
  resolved_at timestamptz,
  unique (kind, symbol, signal_date)
);

create index if not exists card_calls_signal_idx on public.card_calls (signal_date desc, kind);
create index if not exists card_calls_unresolved_idx on public.card_calls (checked_at nulls first)
  where call_outcome in ('pending', 'open');

alter table public.card_calls enable row level security;

select cron.schedule('gsps-card-calls', '20 22 * * 1-5', $$select gsps_ops.call_endpoint('/api/cards/nightly')$$);

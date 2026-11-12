-- GSPS — 0151: the broker paper mirror's lines and its order log
--
-- Owner, 2026-11-12: the platform trades his Alpaca account for him, on paper
-- only until the edge is verified. lib/brokers/paper-mirror.ts copies the
-- owner's automated simulator positions into the app's Alpaca paper account
-- and logs every broker order beside the simulator's price.
--
-- DEPLOY ORDER: apply before the code that reads and writes it is deployed.
-- Without these tables the mirror's reads fail and it places nothing.
--
-- Server-only: written and read with the service role, by the Automated
-- Portfolio Manager's scheduled run. RLS is on with no policy, so no member
-- can read either table.
--
-- The event log is the trade record: rows are never deleted by the app
-- (AGENTS.md ledger rule), losses included.
--
-- Rollback:
--   drop table if exists public.paper_mirror_events;
--   drop table if exists public.paper_mirror_lines;

create table if not exists public.paper_mirror_lines (
  -- the simulator position this line copies (positions.id)
  position_id uuid primary key,
  symbol text not null,
  side text not null check (side in ('long', 'short')),
  status text not null check (status in ('open', 'closed', 'broker_stopped', 'missed')),
  -- shares the simulator held when the mirror last opened or added
  target_qty numeric not null default 0,
  -- the broker order that opened the line (client id gsps-mirror-open-<position_id>)
  open_order_id text,
  -- the one resting good-till-cancelled stop at the broker
  stop_order_id text,
  stop_price numeric,
  stop_qty numeric,
  note text,
  opened_at timestamptz not null default now(),
  closed_at timestamptz
);

create index if not exists paper_mirror_lines_open_idx
  on public.paper_mirror_lines (status) where status = 'open';

create table if not exists public.paper_mirror_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  position_id uuid not null,
  symbol text not null,
  side text,
  -- open | add | reduce | close | set_stop | broker_stopped | missed
  action text not null,
  qty numeric,
  -- the simulator's fill for the same step, where there is one
  sim_price numeric,
  stop_price numeric,
  broker_order_id text,
  -- the broker's order status, or skipped / error
  status text not null,
  fill_price numeric,
  filled_qty numeric,
  filled_at timestamptz,
  note text
);

create index if not exists paper_mirror_events_created_idx
  on public.paper_mirror_events (created_at desc);
create index if not exists paper_mirror_events_unsettled_idx
  on public.paper_mirror_events (id) where fill_price is null and broker_order_id is not null;

alter table public.paper_mirror_lines enable row level security;
alter table public.paper_mirror_events enable row level security;
revoke all on public.paper_mirror_lines from anon, authenticated;
revoke all on public.paper_mirror_events from anon, authenticated;

-- GSPS — 0101: paper-account equity, marked once a session
--
-- docs/SYNTHESIZED_ROADMAP.md Part 5 item 13. A paper account had no record
-- of its equity over time, so promotion's "severe risk event" read only the
-- realized loss against the starting balance, and an open loss never counted.
-- One row per account per New York session date: the latest mark (equity,
-- cash), and the day's highest and lowest marks, written by the scheduled
-- portfolio-manager pass and whenever the member opens the portfolio
-- (lib/portfolio/paper-equity.ts). Paper only: a live account's equity is
-- risk_live_equity_snapshots (0043).
--
-- Gann kept a record of every trade and read his rules back from it (the
-- series of losses, the profit peak); this is the same record of the account.
--
-- Members read their own rows; writes are service-role only.
--
-- Forward-only: no earlier migration is edited.
--
-- Rollback: drop table public.paper_equity_snapshots;

create table if not exists public.paper_equity_snapshots (
  profile_id uuid not null references auth.users (id) on delete cascade,
  session_date date not null,
  equity numeric not null,
  cash numeric not null,
  high_equity numeric not null,
  low_equity numeric not null,
  open_positions integer not null default 0,
  recorded_at timestamptz not null default now(),
  primary key (profile_id, session_date)
);

alter table public.paper_equity_snapshots enable row level security;

create policy "members read their own paper equity" on public.paper_equity_snapshots
  for select using (auth.uid() = profile_id);

revoke insert, update, delete on public.paper_equity_snapshots from anon, authenticated;

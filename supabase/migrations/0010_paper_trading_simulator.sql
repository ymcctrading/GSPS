-- In-app simulated paper trading, replacing the single shared Alpaca paper
-- account every user was previously trading against.
--
-- Why this exists
-- ----------------
-- `envCreds("paper")` read one Alpaca paper account from server env vars and
-- used it for every signed-in user. `positions`/`orders` rows were scoped by
-- `user_id`, but the broker state behind them was not — a brand-new signup
-- saw (and could trade against) whatever the shared account already held.
-- There is no way to give every user their own real Alpaca paper account
-- without friction (each would need to create one and link their own keys),
-- so paper trading is simulated entirely in this database instead: fills
-- happen synchronously against live market prices, `positions`/`orders`/
-- `trade_logs` are the only ledger (no external broker to reconcile against),
-- and Postgres RLS is what makes the isolation real.
--
-- `paper_accounts` is the one new piece of state: the cash balance a market
-- fill debits or credits. Everything else (positions, orders, protocol_exits,
-- trade_logs) already existed and was already scoped by `user_id` — only the
-- fills feeding them were shared.
--
-- Rollback
-- --------
-- `drop table if exists public.paper_accounts;`
-- `alter table public.protocol_exits drop column if exists scale_out_fill_price, drop column if exists master_fill_price, drop column if exists runner_fill_price;`
-- Both additive; no existing column is altered and no data is rewritten.

create table if not exists public.paper_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- Every new account starts with the same simulated balance. Not
  -- configurable yet — if per-user starting capital becomes a feature, this
  -- is the column that would carry it.
  cash numeric not null default 100000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.paper_accounts enable row level security;

create policy "own paper account" on public.paper_accounts
  for all using (auth.uid () = user_id) with check (auth.uid () = user_id);

-- The simulator fills a tranche in full the moment its price is crossed —
-- there is no partial-fill concept, since there is no external broker order
-- book to partially fill against. Each tranche's own fill price is kept so
-- the plan's overall exit price (written to `trade_logs` once every tranche
-- is done) is the correct quantity-weighted blend across all three, exactly
-- as `trade-log-settle.ts` used to compute it from real broker fills.
alter table public.protocol_exits
  add column if not exists scale_out_fill_price numeric,
  add column if not exists master_fill_price numeric,
  add column if not exists runner_fill_price numeric;

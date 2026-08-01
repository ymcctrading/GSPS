-- Order history enrichment: option contract economics, a greeks snapshot taken
-- at fill time, and which protocol target the trade ultimately hit.
--
-- The greeks are stored as a snapshot rather than recomputed on read: they are
-- what the position was opened against, and re-deriving them later from today's
-- IV would quietly rewrite history.

alter table public.orders
  -- What was actually paid, and the full contract-multiplier outlay.
  add column if not exists purchase_price numeric,
  add column if not exists contract_cost numeric,
  -- Option identity (null for equity orders).
  add column if not exists option_type text check (option_type in ('call', 'put')),
  add column if not exists strike numeric,
  add column if not exists expiration date,
  -- Greeks at entry.
  add column if not exists delta numeric,
  add column if not exists gamma numeric,
  add column if not exists theta numeric,
  add column if not exists vega numeric,
  -- Which target was reached. Null = still live / never hit.
  add column if not exists tp1_hit_at timestamptz,
  add column if not exists mp_hit_at timestamptz,
  add column if not exists sl_hit_at timestamptz;

-- `orders.take_profit` / `master_profit` / `stop_price` already carry the TP1,
-- MP and SL levels, so the history grid reads targets and hits from one row.

create index if not exists orders_symbol_idx on public.orders (symbol, created_at desc);

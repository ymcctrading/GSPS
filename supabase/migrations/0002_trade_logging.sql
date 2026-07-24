-- Trade logging system for Versailles release
-- Tracks all entry and exit events with complete trade lifecycle

create table public.trade_logs (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  order_id uuid references public.orders (id) on delete set null,
  position_id uuid references public.positions (id) on delete set null,
  symbol text not null,
  asset_class text not null default 'us_equity',
  direction text not null check (direction in ('buy', 'sell')),
  quantity numeric not null,
  entry_timestamp timestamptz not null,
  entry_price numeric not null,
  exit_timestamp timestamptz,
  exit_price numeric,
  outcome text check (outcome in ('profit', 'loss', 'pending')),
  profit_loss_dollars numeric,
  profit_loss_percent numeric,
  exit_condition text check (exit_condition in ('tp1', 'master_target', 'stop_loss', 'manual', 'pending')),
  signal_called text not null,
  signal_adherence text check (signal_adherence in ('yes', 'no', 'partial')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index trade_logs_user_idx on public.trade_logs (user_id, entry_timestamp desc);
create index trade_logs_symbol_idx on public.trade_logs (symbol, entry_timestamp desc);
create index trade_logs_exit_condition_idx on public.trade_logs (exit_condition) where exit_condition is not null;

alter table public.trade_logs enable row level security;

create policy "own trade logs" on public.trade_logs
  for all using (auth.uid () = user_id) with check (auth.uid () = user_id);

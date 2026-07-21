-- GSPS initial schema
-- Profiles, watchlists, scan results, daily market scans, broker connections,
-- orders, positions (paper ledger + broker mirror), user settings.

-- ============ profiles ============
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "own profile read" on public.profiles
  for select using (auth.uid () = id);

create policy "own profile update" on public.profiles
  for update using (auth.uid () = id);

create policy "own profile insert" on public.profiles
  for insert with check (auth.uid () = id);

-- auto-create profile on signup
create function public.handle_new_user () returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user ();

-- ============ watchlists ============
create table public.watchlists (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default 'My Watchlist',
  created_at timestamptz not null default now()
);

create table public.watchlist_items (
  id uuid primary key default gen_random_uuid (),
  watchlist_id uuid not null references public.watchlists (id) on delete cascade,
  symbol text not null,
  asset_class text not null default 'us_equity' check (asset_class in ('us_equity', 'crypto')),
  added_at timestamptz not null default now(),
  unique (watchlist_id, symbol)
);

alter table public.watchlists enable row level security;
alter table public.watchlist_items enable row level security;

create policy "own watchlists" on public.watchlists
  for all using (auth.uid () = user_id) with check (auth.uid () = user_id);

create policy "own watchlist items" on public.watchlist_items
  for all using (
    exists (select 1 from public.watchlists w where w.id = watchlist_id and w.user_id = auth.uid ())
  ) with check (
    exists (select 1 from public.watchlists w where w.id = watchlist_id and w.user_id = auth.uid ())
  );

-- ============ scan_results (per-user on-demand scans) ============
create table public.scan_results (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  symbol text not null,
  asset_class text not null default 'us_equity',
  direction text check (direction in ('bullish', 'bearish', 'none')),
  score int not null check (score between 0 and 9),
  output_state text not null check (output_state in ('Execute', 'Watch', 'Reject')),
  entry numeric,
  stop_loss numeric,
  take_profit_1 numeric,
  master_profit numeric,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index scan_results_user_created_idx on public.scan_results (user_id, created_at desc);

alter table public.scan_results enable row level security;

create policy "own scan results" on public.scan_results
  for all using (auth.uid () = user_id) with check (auth.uid () = user_id);

-- ============ daily_scans (market-wide 15 bullish + 15 bearish) ============
create table public.daily_scans (
  id uuid primary key default gen_random_uuid (),
  scan_date date not null,
  direction text not null check (direction in ('bullish', 'bearish')),
  rank int not null,
  symbol text not null,
  score int not null check (score between 0 and 9),
  output_state text not null,
  entry numeric,
  stop_loss numeric,
  take_profit_1 numeric,
  master_profit numeric,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (scan_date, direction, rank)
);

create index daily_scans_date_idx on public.daily_scans (scan_date desc);

alter table public.daily_scans enable row level security;

-- readable by any signed-in user; written only by service role (bypasses RLS)
create policy "daily scans readable" on public.daily_scans
  for select using (auth.role () = 'authenticated');

-- ============ broker_connections ============
create table public.broker_connections (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('alpaca_paper', 'alpaca_live', 'snaptrade')),
  label text,
  -- Alpaca: user-supplied API key/secret. SnapTrade: userId + userSecret.
  -- Encrypted at the application layer before insert.
  credentials jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'disabled', 'error')),
  created_at timestamptz not null default now(),
  unique (user_id, provider, label)
);

alter table public.broker_connections enable row level security;

create policy "own broker connections" on public.broker_connections
  for all using (auth.uid () = user_id) with check (auth.uid () = user_id);

-- ============ orders ============
create table public.orders (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  connection_id uuid references public.broker_connections (id) on delete set null,
  mode text not null check (mode in ('paper', 'live')),
  broker_order_id text,
  symbol text not null,
  asset_class text not null default 'us_equity',
  side text not null check (side in ('buy', 'sell')),
  order_type text not null check (order_type in ('market', 'limit', 'stop', 'bracket')),
  qty numeric not null,
  limit_price numeric,
  stop_price numeric,
  take_profit numeric,
  master_profit numeric,
  status text not null default 'new',
  filled_avg_price numeric,
  filled_qty numeric,
  scan_result_id uuid references public.scan_results (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index orders_user_idx on public.orders (user_id, created_at desc);

alter table public.orders enable row level security;

create policy "own orders" on public.orders
  for all using (auth.uid () = user_id) with check (auth.uid () = user_id);

-- ============ positions (paper ledger + broker mirror snapshots) ============
create table public.positions (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  connection_id uuid references public.broker_connections (id) on delete cascade,
  mode text not null check (mode in ('paper', 'live')),
  symbol text not null,
  asset_class text not null default 'us_equity',
  qty numeric not null,
  avg_entry_price numeric not null,
  stop_loss numeric,
  take_profit numeric,
  master_profit numeric,
  closed boolean not null default false,
  realized_pl numeric,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index positions_user_idx on public.positions (user_id, closed, opened_at desc);

alter table public.positions enable row level security;

create policy "own positions" on public.positions
  for all using (auth.uid () = user_id) with check (auth.uid () = user_id);

-- ============ settings ============
create table public.settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  stop_pct_min numeric not null default 12,
  stop_pct_max numeric not null default 18,
  tp1_r_multiple numeric not null default 2,
  master_r_multiple numeric not null default 3,
  default_sectors text[] not null default '{}',
  prefs jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.settings enable row level security;

create policy "own settings" on public.settings
  for all using (auth.uid () = user_id) with check (auth.uid () = user_id);

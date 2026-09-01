-- Saved setups: user-created folders for keeping ranked dashboard setups
-- (buy/sell candidates) for later reference. Distinct from `watchlists`
-- (0001_initial_schema.sql), which tracks bare symbols to watch — a saved
-- setup snapshots the scored trade plan as it looked at save time, since the
-- next day's scan re-ranks everything and can drop the row entirely.

create table public.setup_folders (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default 'Saved setups',
  created_at timestamptz not null default now()
);

create table public.saved_setups (
  id uuid primary key default gen_random_uuid (),
  folder_id uuid not null references public.setup_folders (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  symbol text not null,
  direction text not null check (direction in ('bullish', 'bearish')),
  score numeric,
  output_state text,
  entry numeric,
  stop_loss numeric,
  take_profit1 numeric,
  master_profit numeric,
  pattern_name text,
  setup_kind text,
  saved_at timestamptz not null default now()
);

create index saved_setups_folder_id_idx on public.saved_setups (folder_id);
create index saved_setups_user_id_idx on public.saved_setups (user_id);

alter table public.setup_folders enable row level security;
alter table public.saved_setups enable row level security;

create policy "own setup folders" on public.setup_folders
  for all using (auth.uid () = user_id) with check (auth.uid () = user_id);

create policy "own saved setups" on public.saved_setups
  for all using (auth.uid () = user_id) with check (auth.uid () = user_id);

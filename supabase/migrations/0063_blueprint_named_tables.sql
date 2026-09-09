-- Blueprint-alignment gap #1: literal, table-for-table homes for four
-- concepts the doctrine blueprint names directly (`instrument`, `pivot`,
-- `trend_state`, `digital_root_feature`) that GSPS today only models under
-- different names, scattered across other tables, or computes in memory and
-- never persists at all. See docs/DOCTRINE_ALIGNMENT_STATUS.md. Gap #2
-- (futures/forex/options execution mechanics) is explicitly out of scope for
-- this migration.
--
-- Existing GSPS concept each new table gives a literal home to:
--
--   instrument            -- today a bare `symbol`/`asset_class` text pair
--                             repeated on watchlist_items, scan_results,
--                             daily_scans, orders, positions, scan_events,
--                             execution_events and trade_plans(instrument,
--                             market), with no dimension table tying one
--                             instrument's rows together.
--   pivot                 -- lib/analysis/pivots.ts's `findPivots`/
--                             `clusterLevels` (swing highs/lows and the
--                             support/resistance clusters built from them).
--                             Computed fresh on every scan and never
--                             persisted today -- not to be confused with
--                             `PivotPlan` (lib/types.ts), the counter-
--                             direction trade scenario, which already has a
--                             home in scan_results.detail / trade_plans and
--                             is left alone here.
--   trend_state            -- lib/signals/regime.ts's `classifyRegime`
--                             output (`RegimeRead`: regime/direction/
--                             reasons/disqualifiers). Persisted today only
--                             embedded inside trade_plans.regime jsonb, so
--                             it can't be queried or joined on its own and
--                             isn't recorded for scans that never became a
--                             trade plan.
--   digital_root_feature   -- the Gann digital-root (3/6/9) feature, today
--                             a bare `gann_root` int column on scan_events
--                             and learning_coefficients with no place to
--                             record what it was derived from or how far
--                             price/time sat from the node.
--
-- All four are additive; no existing table, column, or RLS policy changes.
-- Application code is not wired to write these yet -- that's separate,
-- follow-up work once the write paths (scan pipeline, regime classifier,
-- lifecycle store) are updated to populate them going forward. This
-- migration also backfills what can be reconstructed from existing rows:
-- `instrument` (from every table's symbol/asset_class pairs), and
-- `digital_root_feature` / `trend_state` (from scan_events.gann_root and
-- trade_plans.regime respectively). `pivot` cannot be backfilled -- the
-- swing pivots it holds were never stored anywhere, only computed
-- transiently -- so it starts empty.
--
-- Rollback:
--   drop table if exists public.digital_root_feature;
--   drop table if exists public.trend_state;
--   drop table if exists public.pivot;
--   drop table if exists public.instrument;

-- ============ instrument (global dimension table) ============
create table if not exists public.instrument (
  id uuid primary key default gen_random_uuid (),
  symbol text not null,
  asset_class text not null default 'us_equity'
    check (asset_class in ('us_equity', 'option', 'crypto', 'forex', 'futures', 'commodities')),
  exchange text,
  name text,
  created_at timestamptz not null default now(),
  unique (symbol, asset_class)
);

create index if not exists instrument_symbol_idx on public.instrument (symbol);

-- Reference data, not per-user: readable by any signed-in user, written only
-- by the service role (same pattern as daily_scans in 0001).
alter table public.instrument enable row level security;

create policy "instruments readable" on public.instrument
  for select using (auth.role () = 'authenticated');

-- ============ pivot (persisted swing pivots / S-R clusters) ============
create table if not exists public.pivot (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  instrument_id uuid not null references public.instrument (id) on delete cascade,
  scan_event_id uuid references public.scan_events (id) on delete set null,
  timeframe text not null
    check (timeframe in ('1m', '5m', '15m', '1h', '2h', '4h', '1d', '1w', '1mo', '1y')),
  kind text not null check (kind in ('high', 'low')),
  price numeric not null,
  bar_time timestamptz,
  strength int not null default 3,
  cluster_price numeric,
  role text check (role in ('support', 'resistance')),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists pivot_user_instrument_idx
  on public.pivot (user_id, instrument_id, timeframe, created_at desc);

alter table public.pivot enable row level security;

create policy "own pivots" on public.pivot
  for all using (auth.uid () = user_id) with check (auth.uid () = user_id);

-- ============ trend_state (persisted regime reads) ============
create table if not exists public.trend_state (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  instrument_id uuid not null references public.instrument (id) on delete cascade,
  trade_plan_id uuid references public.trade_plans (plan_id) on delete set null,
  scan_event_id uuid references public.scan_events (id) on delete set null,
  timeframe text not null
    check (timeframe in ('1m', '5m', '15m', '1h', '2h', '4h', '1d', '1w', '1mo', '1y')),
  regime text not null check (regime in ('trend', 'range', 'transition', 'event')),
  direction text not null check (direction in ('bullish', 'bearish', 'sideways')),
  reasons text[] not null default '{}',
  disqualifiers text[] not null default '{}',
  detail jsonb not null default '{}'::jsonb,
  as_of timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists trend_state_user_instrument_idx
  on public.trend_state (user_id, instrument_id, timeframe, as_of desc);

alter table public.trend_state enable row level security;

create policy "own trend state" on public.trend_state
  for all using (auth.uid () = user_id) with check (auth.uid () = user_id);

-- ============ digital_root_feature (persisted Gann digital-root reads) ============
create table if not exists public.digital_root_feature (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  instrument_id uuid not null references public.instrument (id) on delete cascade,
  scan_event_id uuid references public.scan_events (id) on delete set null,
  root_type text not null default 'price' check (root_type in ('price', 'time')),
  root_value int not null check (root_value in (3, 6, 9)),
  source_value numeric,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists digital_root_feature_user_instrument_idx
  on public.digital_root_feature (user_id, instrument_id, created_at desc);

create index if not exists digital_root_feature_root_value_idx
  on public.digital_root_feature (root_value);

alter table public.digital_root_feature enable row level security;

create policy "own digital root features" on public.digital_root_feature
  for all using (auth.uid () = user_id) with check (auth.uid () = user_id);

-- ============ backfill: instrument ============
-- One row per distinct (symbol, asset_class) already seen anywhere in the
-- schema. Filtered to instrument's own allowed asset_class set so a
-- surprise value in older data can't fail the whole backfill.
insert into public.instrument (symbol, asset_class)
select distinct symbol, asset_class
from (
  select symbol, asset_class from public.watchlist_items
  union
  select symbol, asset_class from public.scan_results
  union
  -- daily_scans carries no asset_class column; it's the market-wide daily
  -- equity scan (see supabase/AGENTS.md) so every row is us_equity.
  select symbol, 'us_equity' as asset_class from public.daily_scans
  union
  select symbol, asset_class from public.orders
  union
  select symbol, asset_class from public.positions
  union
  select symbol, asset_class from public.scan_events
  union
  select symbol, asset_class from public.execution_events
  union
  select instrument as symbol, market as asset_class from public.trade_plans
) seen
where asset_class in ('us_equity', 'option', 'crypto', 'forex', 'futures', 'commodities')
on conflict (symbol, asset_class) do nothing;

-- ============ backfill: digital_root_feature (from scan_events) ============
insert into public.digital_root_feature (user_id, instrument_id, scan_event_id, root_type, root_value, source_value)
select se.user_id, i.id, se.id, 'price', se.gann_root, se.price
from public.scan_events se
join public.instrument i on i.symbol = se.symbol and i.asset_class = se.asset_class
where se.gann_root is not null;

-- ============ backfill: trend_state (from trade_plans.regime) ============
-- trade_plans.regime is a not-null jsonb `RegimeRead` (lib/signals/types.ts):
-- {regime, direction, reasons, disqualifiers}. Rows whose shape predates
-- that contract or fails the check constraints are skipped rather than
-- failing the whole backfill.
insert into public.trend_state (
  user_id, instrument_id, trade_plan_id, timeframe, regime, direction, reasons, disqualifiers, as_of
)
select
  tp.user_id,
  i.id,
  tp.plan_id,
  tp.timeframe,
  tp.regime ->> 'regime',
  tp.regime ->> 'direction',
  case when jsonb_typeof(tp.regime -> 'reasons') = 'array'
    then coalesce((select array_agg(value) from jsonb_array_elements_text(tp.regime -> 'reasons')), '{}')
    else '{}' end,
  case when jsonb_typeof(tp.regime -> 'disqualifiers') = 'array'
    then coalesce((select array_agg(value) from jsonb_array_elements_text(tp.regime -> 'disqualifiers')), '{}')
    else '{}' end,
  tp.generated_at
from public.trade_plans tp
join public.instrument i on i.symbol = tp.instrument and i.asset_class = tp.market
where tp.regime ->> 'regime' in ('trend', 'range', 'transition', 'event')
  and tp.regime ->> 'direction' in ('bullish', 'bearish', 'sideways');

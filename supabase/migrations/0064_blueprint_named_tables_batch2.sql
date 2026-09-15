-- Blueprint-alignment gap #1, continued: `0063_blueprint_named_tables.sql`
-- gave literal homes to 4 of the doctrine blueprint's 20 named tables
-- (§5.2 "Data model": instrument, bar, corporate_action, instrument_profile,
-- pivot, trend_state, volume_state, volatility_state, market_regime,
-- gann_coordinate, vortex_state, digital_root_feature, strategy_signal,
-- trade_plan, risk_plan, signal_outcome, backtest_run, feature_registry,
-- experiment_registry, model_version, audit_event). This migration adds the
-- 8 more that have no existing GSPS home under any name. The other 8 are
-- deliberately NOT added here -- each already has a real, non-empty home,
-- and adding a second, same-shaped table under the blueprint's literal name
-- would be a duplicate concept, not a gap:
--
--   market_regime    -- `trend_state` (0063) already carries regime/
--                        direction for any instrument, benchmarks included.
--   gann_coordinate   -- `gann_evaluations.coordinate_outputs` (0048).
--   vortex_state      -- `digital_root_feature` (0063) +
--                        `gann_evaluations.digit_inputs` (0048).
--   strategy_signal   -- `scan_results`/`scan_events`/`strategy_modules`.
--   trade_plan        -- `trade_plans` (0001), already this exact concept.
--   risk_plan         -- `protocol_exits`/`risk_circuit_state`/
--                        `risk_trade_loss_state`/`live_trading_restrictions`.
--   signal_outcome    -- `trade_logs` (0002): entry/exit/profit-loss tied to
--                        a signal via order/position, already this concept.
--   model_version     -- `learning_models` (0005): versioned model with
--                        status draft/approved/live/deprecated, already this
--                        concept.
--   audit_event       -- `trade_plan_audit`/`learning_audit_log`/
--                        `risk_circuit_audit_log`/`signal_lifecycle_events`/
--                        `user_actions`.
--
-- The 8 added here have no such existing home:
--
--   bar                -- OHLCV cache. GSPS fetches bars live from providers
--                          on every scan/chart request and has never
--                          persisted one; this is schema only, still unwired.
--   corporate_action   -- splits/dividends/mergers. No existing table.
--   instrument_profile -- sector/industry/market cap/float/avg dollar
--                          volume, one row per instrument. Distinct from the
--                          still-genuinely-Absent "instrument behavior
--                          profiles" (per-instrument trading "habits") gap
--                          in docs/GANN_BLUEPRINT_TRACEABILITY.md -- this is
--                          the blueprint's narrower classification-attribute
--                          concept, not that one.
--   volume_state       -- relative/dollar volume index reads, same per-user/
--                          per-scan-event shape as 0063's volume-adjacent
--                          tables.
--   volatility_state   -- ATR/ATR-percentile/regime reads, same shape.
--   feature_registry   -- a catalog of computed feature definitions
--                          (formula, version, experimental/validated
--                          status) -- distinct from `learning_models`, which
--                          versions score-adjustment *coefficients*, not
--                          feature *definitions*.
--   experiment_registry -- research experiments/ablations tracking. No
--                          existing table; `docs/replay-runs/*.json` and
--                          markdown reports are the closest thing today, and
--                          those stay file-based.
--   backtest_run        -- persisted backtest/replay results. Today's
--                          backtests (`lib/backtest/*`) run as a local CLI
--                          tool with no per-user scope and no DB write --
--                          results live only in `docs/replay-runs/*.json`
--                          and `docs/REPLAY_RESULTS_*.md`. Not user-scoped
--                          for the same reason `learning_models` isn't:
--                          there's no per-user ownership concept for a
--                          global research artifact.
--
-- All 8 are additive; no existing table, column, or RLS policy changes.
-- Schema only -- application code is not wired to write or read any of
-- these yet, same posture 0063 took for `pivot` (started empty) and
-- `digital_root_feature` (no live-pipeline writer at the time). No backfill:
-- unlike 0063's `instrument`/`digital_root_feature`/`trend_state`, none of
-- these 8 concepts have existing rows anywhere else in the schema to
-- reconstruct from.
--
-- Rollback:
--   drop table if exists public.backtest_run;
--   drop table if exists public.experiment_registry;
--   drop table if exists public.feature_registry;
--   drop table if exists public.volatility_state;
--   drop table if exists public.volume_state;
--   drop table if exists public.instrument_profile;
--   drop table if exists public.corporate_action;
--   drop table if exists public.bar;

-- ============ bar (global OHLCV cache) ============
create table if not exists public.bar (
  id uuid primary key default gen_random_uuid (),
  instrument_id uuid not null references public.instrument (id) on delete cascade,
  timeframe text not null
    check (timeframe in ('1m', '5m', '15m', '1h', '2h', '4h', '1d', '1w', '1mo', '1y')),
  bar_time timestamptz not null,
  open numeric not null,
  high numeric not null,
  low numeric not null,
  close numeric not null,
  volume numeric not null default 0,
  data_vendor text,
  created_at timestamptz not null default now(),
  unique (instrument_id, timeframe, bar_time)
);

create index if not exists bar_instrument_timeframe_idx
  on public.bar (instrument_id, timeframe, bar_time desc);

-- Reference data, not per-user: same posture as `instrument` (0063).
alter table public.bar enable row level security;

create policy "bars readable" on public.bar
  for select using (auth.role () = 'authenticated');

-- ============ corporate_action (global) ============
create table if not exists public.corporate_action (
  id uuid primary key default gen_random_uuid (),
  instrument_id uuid not null references public.instrument (id) on delete cascade,
  action_type text not null
    check (action_type in ('split', 'reverse_split', 'dividend', 'merger', 'spinoff', 'symbol_change')),
  ex_date date not null,
  ratio numeric,
  amount numeric,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists corporate_action_instrument_idx
  on public.corporate_action (instrument_id, ex_date desc);

alter table public.corporate_action enable row level security;

create policy "corporate actions readable" on public.corporate_action
  for select using (auth.role () = 'authenticated');

-- ============ instrument_profile (global, one row per instrument) ============
create table if not exists public.instrument_profile (
  instrument_id uuid primary key references public.instrument (id) on delete cascade,
  sector text,
  industry text,
  market_cap numeric,
  float_shares numeric,
  avg_dollar_volume numeric,
  updated_at timestamptz not null default now()
);

alter table public.instrument_profile enable row level security;

create policy "instrument profiles readable" on public.instrument_profile
  for select using (auth.role () = 'authenticated');

-- ============ volume_state (per-user, per-scan reads) ============
create table if not exists public.volume_state (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  instrument_id uuid not null references public.instrument (id) on delete cascade,
  scan_event_id uuid references public.scan_events (id) on delete set null,
  timeframe text not null
    check (timeframe in ('1m', '5m', '15m', '1h', '2h', '4h', '1d', '1w', '1mo', '1y')),
  relative_volume_index numeric,
  dollar_volume_index numeric,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists volume_state_user_instrument_idx
  on public.volume_state (user_id, instrument_id, timeframe, created_at desc);

alter table public.volume_state enable row level security;

create policy "own volume state" on public.volume_state
  for all using (auth.uid () = user_id) with check (auth.uid () = user_id);

-- ============ volatility_state (per-user, per-scan reads) ============
create table if not exists public.volatility_state (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  instrument_id uuid not null references public.instrument (id) on delete cascade,
  scan_event_id uuid references public.scan_events (id) on delete set null,
  timeframe text not null
    check (timeframe in ('1m', '5m', '15m', '1h', '2h', '4h', '1d', '1w', '1mo', '1y')),
  atr numeric,
  atr_percentile numeric,
  volatility_regime text check (volatility_regime in ('low', 'normal', 'elevated', 'extreme')),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists volatility_state_user_instrument_idx
  on public.volatility_state (user_id, instrument_id, timeframe, created_at desc);

alter table public.volatility_state enable row level security;

create policy "own volatility state" on public.volatility_state
  for all using (auth.uid () = user_id) with check (auth.uid () = user_id);

-- ============ feature_registry (global catalog of feature definitions) ============
create table if not exists public.feature_registry (
  feature_key text primary key,
  display_name text not null,
  formula_description text not null,
  version text not null,
  status text not null default 'experimental' check (status in ('experimental', 'validated', 'deprecated')),
  owner text not null default 'GSPS',
  created_at timestamptz not null default now()
);

alter table public.feature_registry enable row level security;

create policy "feature registry readable" on public.feature_registry
  for select using (auth.role () = 'authenticated');

-- ============ experiment_registry (global research/experiment tracking) ============
create table if not exists public.experiment_registry (
  id uuid primary key default gen_random_uuid (),
  experiment_key text not null unique,
  name text not null,
  hypothesis text not null,
  status text not null default 'proposed' check (status in ('proposed', 'running', 'concluded', 'abandoned')),
  started_at timestamptz,
  concluded_at timestamptz,
  result_summary jsonb not null default '{}'::jsonb,
  owner text not null default 'GSPS',
  created_at timestamptz not null default now()
);

alter table public.experiment_registry enable row level security;

create policy "experiment registry readable" on public.experiment_registry
  for select using (auth.role () = 'authenticated');

-- ============ backtest_run (global, no per-user ownership) ============
-- Same posture as `learning_models` (0005): RLS on, no client-facing policy
-- -- server-side/service-role access only, since there's no per-user
-- ownership concept for a global research artifact.
create table if not exists public.backtest_run (
  id uuid primary key default gen_random_uuid (),
  strategy_version text not null,
  parameter_set jsonb not null default '{}'::jsonb,
  window_start date,
  window_end date,
  sample_count int,
  win_rate numeric,
  expectancy_r numeric,
  profit_factor numeric,
  max_drawdown_r numeric,
  slippage_sensitivity jsonb,
  report_path text,
  created_at timestamptz not null default now()
);

alter table public.backtest_run enable row level security;

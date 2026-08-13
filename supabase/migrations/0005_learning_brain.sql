-- Learning Brain Instrumentation
-- Deterministic, audit-ready learning layer that improves scoring without mutating core Gann scanner
-- Collects comprehensive scan, trade, and market data for ML feature engineering
--
-- Applied to production 2026-08-09. It had never run before that: the
-- learning_coefficients scope key was written as a table-level UNIQUE over
-- coalesce() expressions, which Postgres does not accept — only bare column
-- names — so the file failed on parse. lib/learning/db.ts had been querying
-- these tables against a schema that did not exist. The key is unchanged in
-- meaning; it is declared below as a unique index, which does allow
-- expressions.
--
-- The three learning_* tables carry no user_id, so RLS was originally left off.
-- In a Supabase project that means PostgREST serves them to anyone holding the
-- publishable key. They now enable RLS with no policy attached: the service
-- role still reads and writes them, and nothing else can. The database linter
-- reports that as `rls_enabled_no_policy` at INFO — it is deliberate, and a
-- permissive policy must not be added to silence it.

-- ============ scan_events (every scan snapshot) ============
create table public.scan_events (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  scan_id text not null, -- unique per scan request
  timestamp timestamptz not null default now(),
  timeframe text not null check (timeframe in ('1m', '5m', '15m', '1h', '2h', '4h', '1d', '1w', '1mo', '1y')),
  extended_hours_flag boolean not null default false,
  symbol text not null,
  asset_class text not null default 'us_equity' check (asset_class in ('us_equity', 'option', 'crypto', 'forex', 'futures', 'commodities')),
  -- Signal details
  price numeric not null,
  score int not null check (score between 0 and 9),
  signal_type text check (signal_type in ('bullish', 'bearish', 'none')),
  -- Gann geometry
  gann_root int check (gann_root in (3, 6, 9)),
  entry_level numeric,
  stop_loss_level numeric,
  take_profit_1_level numeric,
  master_profit_level numeric,
  -- Market bias
  bias text check (bias in ('bull', 'bear', 'neutral')),
  -- OHLCV context
  ohlcv jsonb not null default '{}', -- {open, high, low, close, volume}
  -- Higher-TF context (for multi-timeframe analysis)
  higher_tf_context jsonb not null default '{}', -- [{timeframe, bias, score}, ...]
  -- Full scan details
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index scan_events_user_timestamp_idx on public.scan_events (user_id, created_at desc);
create index scan_events_symbol_idx on public.scan_events (symbol, created_at desc);
create index scan_events_gann_root_idx on public.scan_events (gann_root) where gann_root is not null;

alter table public.scan_events enable row level security;

create policy "own scan events" on public.scan_events
  for all using (auth.uid () = user_id) with check (auth.uid () = user_id);

-- ============ signal_lifecycle_events (state transitions) ============
create table public.signal_lifecycle_events (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  signal_id text not null, -- links to scan_event.scan_id
  scan_event_id uuid references public.scan_events (id) on delete set null,
  state text not null check (state in ('armed', 'active', 'confirmed', 'expired', 'invalidated')),
  state_transition_reason text, -- e.g., 'time_decay', 'broker_blocked', 'user_ignored', 'price_target_hit'
  timestamp timestamptz not null default now(),
  metadata jsonb not null default '{}' -- contextual data for the transition
);

create index signal_lifecycle_events_user_idx on public.signal_lifecycle_events (user_id, timestamp desc);
create index signal_lifecycle_events_signal_id_idx on public.signal_lifecycle_events (signal_id, timestamp asc);
create index signal_lifecycle_events_state_idx on public.signal_lifecycle_events (state);

alter table public.signal_lifecycle_events enable row level security;

create policy "own signal lifecycle" on public.signal_lifecycle_events
  for all using (auth.uid () = user_id) with check (auth.uid () = user_id);

-- ============ execution_events (order execution + fills) ============
create table public.execution_events (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  order_id uuid references public.orders (id) on delete set null,
  signal_id text,
  broker text not null check (broker in ('alpaca_paper', 'alpaca_live', 'snaptrade')),
  symbol text not null,
  asset_class text not null default 'us_equity',
  -- Execution details
  order_type text not null check (order_type in ('market', 'limit', 'stop', 'bracket')),
  side text not null check (side in ('buy', 'sell')),
  quantity numeric not null,
  requested_price numeric,
  filled_price numeric,
  filled_qty numeric,
  partial_fill boolean not null default false,
  slippage numeric,
  -- Broker API details
  broker_status text not null check (broker_status in ('pending', 'filled', 'partial', 'cancelled', 'rejected', 'error')),
  broker_error_code text,
  broker_error_msg text,
  -- Idempotency
  order_idempotency_key text, -- scan_id:signal_id:attempt_n
  retry_count int not null default 0,
  -- Timing
  timestamp timestamptz not null default now(),
  latency_ms int
);

create index execution_events_user_idx on public.execution_events (user_id, timestamp desc);
create index execution_events_order_id_idx on public.execution_events (order_id);
create index execution_events_idempotency_key_idx on public.execution_events (order_idempotency_key);

alter table public.execution_events enable row level security;

create policy "own execution events" on public.execution_events
  for all using (auth.uid () = user_id) with check (auth.uid () = user_id);

-- ============ user_actions (trading decisions) ============
create table public.user_actions (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  signal_id text not null,
  scan_event_id uuid references public.scan_events (id) on delete set null,
  -- Action
  action text not null check (action in ('accept', 'ignore', 'defer', 'override')),
  tier text not null check (tier in ('Passive', 'Modest', 'Aggressive')), -- risk tier
  -- Risk params used
  risk_qty numeric,
  risk_stop_pct numeric,
  risk_r_multiple numeric,
  -- Manual overrides
  override_entry numeric,
  override_stop numeric,
  override_tp1 numeric,
  override_master numeric,
  -- Journal tags (user-provided)
  journal_tags text[] not null default '{}', -- e.g., ['followed_plan', 'emotional', 'news_driven']
  journal_notes text,
  -- Timing
  timestamp timestamptz not null default now()
);

create index user_actions_user_idx on public.user_actions (user_id, timestamp desc);
create index user_actions_signal_id_idx on public.user_actions (signal_id);

alter table public.user_actions enable row level security;

create policy "own user actions" on public.user_actions
  for all using (auth.uid () = user_id) with check (auth.uid () = user_id);

-- ============ learning_models (versioned model definitions with audit) ============
create table public.learning_models (
  id uuid primary key default gen_random_uuid (),
  version int not null,
  model_type text not null check (model_type in ('score_adjustment', 'target_envelope', 'entry_confidence')),
  -- Model metadata
  training_data_slice text, -- e.g., "2020-01-01:2025-12-31", "all_users", "tier:Aggressive"
  sample_count int,
  training_metrics jsonb not null default '{}', -- {accuracy, precision, recall, f1, ...}
  -- Coefficients and parameters
  coefficients jsonb not null default '{}',
  constraints jsonb not null default '{}', -- enforcement constraints
  -- Governance
  created_at timestamptz not null default now(),
  created_by text, -- admin or system
  change_reason text, -- why this model was created/updated
  approved_at timestamptz,
  approved_by text,
  status text not null default 'draft' check (status in ('draft', 'approved', 'live', 'deprecated')),
  deprecated_at timestamptz,
  unique (model_type, version)
);

create index learning_models_type_status_idx on public.learning_models (model_type, status);

-- System table: written by the service role, readable by nothing else.
alter table public.learning_models enable row level security;

-- ============ learning_coefficients (versioned adjustment factors) ============
create table public.learning_coefficients (
  id uuid primary key default gen_random_uuid (),
  model_id uuid not null references public.learning_models (id) on delete cascade,
  timeframe text check (timeframe in ('1m', '5m', '15m', '1h', '2h', '4h', '1d', '1w', '1mo', '1y', 'all')),
  instrument_class text check (instrument_class in ('us_equity', 'option', 'crypto', 'forex', 'futures', 'commodities', 'all')),
  gann_root int check (gann_root in (3, 6, 9)), -- null = applies to all
  tier text check (tier in ('Passive', 'Modest', 'Aggressive', 'all')),
  -- Adjustment factors (normalized deltas, not raw values)
  score_drift numeric, -- e.g., +0.5 means add 0.5 points to base score
  target_envelope_widen_factor numeric, -- e.g., 1.1 = widen TP/SL by 10%
  entry_confidence_boost numeric, -- e.g., +0.15 = +15% confidence
  sample_count int,
  last_updated timestamptz not null default now()
);

-- One row per (model, scope). A table-level UNIQUE cannot hold expressions, and
-- the scope columns are nullable, so the key is a unique index over coalesce()
-- — otherwise two rows differing only by a NULL would both be allowed.
create unique index learning_coefficients_scope_idx on public.learning_coefficients (
  model_id,
  coalesce(timeframe, ''),
  coalesce(instrument_class, ''),
  coalesce(gann_root::text, ''),
  coalesce(tier, '')
);

alter table public.learning_coefficients enable row level security;

-- ============ learning_audit_log (immutable record of model changes) ============
create table public.learning_audit_log (
  id uuid primary key default gen_random_uuid (),
  model_id uuid not null references public.learning_models (id) on delete cascade,
  event_type text not null check (event_type in ('created', 'updated', 'approved', 'deprecated', 'coefficient_changed')),
  old_value jsonb,
  new_value jsonb,
  changed_by text not null,
  reason text,
  timestamp timestamptz not null default now()
);

create index learning_audit_log_model_idx on public.learning_audit_log (model_id, timestamp desc);

alter table public.learning_audit_log enable row level security;

-- Trade-plan lifecycle: the versioned, persisted trade-plan object and its
-- audit trail, per the "Trade Lifecycle, Exit & Runner Engine" spec pack
-- (2026-08-28). "A signal without complete lifecycle fields is not
-- tradeable" -- every required field group (identity, coordinates, risk,
-- evidence, state, audit) is a not-null column here rather than left to a
-- jsonb blob an incomplete writer could partially fill.
--
-- State machine (enforced in application code by lib/lifecycle/transitions.ts,
-- mirrored here only as a check constraint on the allowed values):
--   watchlist -> qualified -> armed -> entered -> tp1_reached -> tp2_reached
--   -> master_reached -> runner -> closed
--   any pre-entry state -> expired
--   any active (post-entry) state -> invalidated
--
-- trade_plan_audit is append-only and mirrors TradePlan.audit exactly, so a
-- plan's persisted `version` always equals the count of its audit rows --
-- "all plan edits, user actions, price events, notifications,
-- executions/imported fills" get one row each, never an in-place update.
--
-- Rollback: `drop table if exists public.trade_plan_audit; drop table if
-- exists public.trade_plans;`. Additive only -- no existing table is altered.

create table if not exists public.trade_plans (
  plan_id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,

  -- Identity
  strategy_version text not null,
  signal_id text not null,
  instrument text not null,
  market text not null,
  timeframe text not null,
  direction text not null check (direction in ('bullish', 'bearish')),
  generated_at timestamptz not null,
  expires_at timestamptz not null,

  -- Coordinates
  entry_trigger numeric not null,
  entry_limit_tolerance numeric not null,
  invalidation numeric not null,
  stop_type text not null
    check (stop_type in ('alert_only', 'stop_market', 'stop_limit', 'close_confirmed_alert')),
  take_profit_1 numeric not null,
  take_profit_2 numeric not null,
  master_profit numeric,
  runner_rule jsonb not null,

  -- Risk
  approved_quantity numeric not null,
  fractional_capability boolean not null default false,
  planned_dollar_risk numeric not null,
  allocation_pct numeric not null,
  total_open_risk_snapshot numeric not null,

  -- Evidence
  regime jsonb not null,
  alignment jsonb not null,
  data_timestamps jsonb not null default '{}'::jsonb,
  event_liquidity_status text not null,

  -- State
  state text not null default 'watchlist'
    check (state in (
      'watchlist', 'qualified', 'armed', 'entered',
      'tp1_reached', 'tp2_reached', 'master_reached', 'runner',
      'closed', 'expired', 'invalidated'
    )),
  version integer not null default 0,

  -- Execution facts, populated as they happen.
  actual_entry_price numeric,
  actual_entry_at timestamptz,
  high_water numeric,
  master_profit_floor numeric,
  closed_at timestamptz,
  close_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A closed-out plan always carries the timestamp/reason that closed it, and
  -- an open plan carries neither -- the two columns move together.
  constraint trade_plans_close_fields_consistent check (
    (state in ('closed', 'expired', 'invalidated')) = (closed_at is not null)
  )
);

create index if not exists trade_plans_user_state_idx
  on public.trade_plans (user_id, state, expires_at);

create index if not exists trade_plans_signal_idx
  on public.trade_plans (user_id, signal_id);

alter table public.trade_plans enable row level security;

create policy "own trade plans" on public.trade_plans
  for all using (auth.uid () = user_id) with check (auth.uid () = user_id);

create table if not exists public.trade_plan_audit (
  id uuid primary key default gen_random_uuid (),
  plan_id uuid not null references public.trade_plans (plan_id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  version integer not null,
  at timestamptz not null,
  kind text not null
    check (kind in ('plan_edit', 'user_action', 'price_event', 'notification', 'execution', 'imported_fill')),
  from_state text not null,
  to_state text not null,
  reason text not null,
  risk_increased boolean not null default false,
  user_confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (plan_id, version)
);

create index if not exists trade_plan_audit_plan_idx
  on public.trade_plan_audit (plan_id, version);

alter table public.trade_plan_audit enable row level security;

create policy "own trade plan audit" on public.trade_plan_audit
  for all using (auth.uid () = user_id) with check (auth.uid () = user_id);

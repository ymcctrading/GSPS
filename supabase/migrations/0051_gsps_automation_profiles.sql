-- Plan-scoped, Wall-Street-only automation profiles, per the "GSPS
-- Implementation Brief" single-source-of-truth spec pack (2026-08-31).
--
-- Distinct from the pre-existing `user_automation_profiles`
-- (components/automation/control-panel.tsx, the "Automated Portfolio
-- Manager" / System Mastery feature) -- that table drives a fully
-- autonomous, non-plan-scoped engine (risk dial + directional bias +
-- volatility trigger, no reference to a specific trade_plans row) shipped
-- separately in PR #23. This migration adds the model the brief actually
-- specifies: a member deliberately activates automation against one
-- specific, already entry-confirmed GSPS candidate plan, in paper or live
-- mode, with an execution mode that's immutable once set. Both tables are
-- kept -- this migration renames nothing and drops nothing.
--
-- Authorization: Wall Street only (`automationEnabled` in
-- lib/entitlements/policy.ts, already the "Wall Street" gate per that
-- file's own tier-naming note). Enforced server-side in
-- lib/automation/service.ts AND here via RLS -- "hiding a tab is not
-- authorization." No INSERT/UPDATE/DELETE grant exists for the
-- `authenticated` role on any of these three tables; every mutation goes
-- through a service-role server action so entitlement, plan-eligibility,
-- and execution-mode-immutability checks cannot be bypassed by a direct
-- client write. Owners can SELECT their own rows only.
--
-- Rollback: drop table if exists public.order_intents;
--           drop table if exists public.automation_events;
--           drop table if exists public.automation_profiles;

create table if not exists public.automation_profiles (
  profile_id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_id uuid not null references public.trade_plans (plan_id) on delete cascade,

  -- "System-plan automation" (member selects an eligible system-generated
  -- plan as-is) or "Guided custom automation" (member configures only
  -- schema-approved settings against that same plan). Neither mode lets a
  -- member supply raw ticker/side/price/stop/quantity -- see `configuration`.
  automation_mode text not null check (automation_mode in ('system_plan', 'guided_custom')),

  -- Immutable after activation (enforced in lib/automation/service.ts --
  -- no update path this app exposes ever changes this column). "A live
  -- position may not be converted to paper to evade controls."
  execution_mode text not null check (execution_mode in ('paper', 'live')),

  status text not null default 'active'
    check (status in ('active', 'paused', 'stopped', 'completed')),

  -- Bounded, schema-validated member configuration (allocation, approved
  -- asset/timeframe subset, etc.) -- never raw order terms. Validated
  -- server-side against the plan's own coordinates before being trusted.
  configuration jsonb not null default '{}'::jsonb,

  activated_at timestamptz not null default now(),
  paused_at timestamptz,
  stopped_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One automation profile per (user, plan): a member automates a given
  -- candidate plan at most once, matching the brief's "member deliberately
  -- elects to automate an eligible plan" (a decision, not a queue).
  unique (user_id, plan_id)
);

create index if not exists automation_profiles_user_status_idx
  on public.automation_profiles (user_id, status);

alter table public.automation_profiles enable row level security;

create policy "own automation profiles (read only)" on public.automation_profiles
  for select using (auth.uid () = user_id);

create table if not exists public.automation_events (
  id uuid primary key default gen_random_uuid (),
  profile_id uuid not null references public.automation_profiles (profile_id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now(),
  kind text not null check (kind in (
    'activated', 'paused', 'resumed', 'stopped',
    'order_intent_created', 'order_authorized', 'order_blocked',
    'broker_order_submitted', 'broker_order_rejected', 'fill_recorded'
  )),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists automation_events_profile_idx
  on public.automation_events (profile_id, at);

alter table public.automation_events enable row level security;

create policy "own automation events (read only)" on public.automation_events
  for select using (auth.uid () = user_id);

create table if not exists public.order_intents (
  id uuid primary key default gen_random_uuid (),
  profile_id uuid not null references public.automation_profiles (profile_id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_id uuid not null references public.trade_plans (plan_id) on delete cascade,
  execution_mode text not null check (execution_mode in ('paper', 'live')),
  side text not null check (side in ('buy', 'sell')),
  status text not null default 'pending'
    check (status in ('pending', 'authorized', 'blocked', 'submitted', 'filled', 'rejected', 'canceled')),
  block_reason text,
  order_id uuid, -- set once submitted; references public.orders(id), not FK'd (orders.id typing predates this table)
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists order_intents_profile_idx
  on public.order_intents (profile_id, created_at);

alter table public.order_intents enable row level security;

create policy "own order intents (read only)" on public.order_intents
  for select using (auth.uid () = user_id);

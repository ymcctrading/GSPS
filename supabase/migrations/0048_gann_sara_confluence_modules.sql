-- Gann Confluence Layer / Sara Sniper Strat Confluence Layer registry and
-- evaluation audit trail, per the "GSPS Gann & Sara Cross-Market Integration
-- Addendum" (2026-08-28). Both modules are additive confluence factors on
-- top of the existing Signal and Regime Engine (lib/signals) — never a sole
-- signal, never able to override a safety/account/eligibility gate. See
-- docs/GANN_SARA_CONFLUENCE.md.
--
-- strategy_modules is the DB mirror of lib/signals/confluence/registry.ts's
-- static module list — a registry, not a dynamic loader; the app still wires
-- modules by import, this table exists so module identity/version/
-- authorized-source is queryable and auditable independent of a deploy.
--
-- gann_evaluations / sara_evaluations are append-only snapshots of what each
-- module computed for a given signal, keyed loosely (signal_id is app-
-- generated, not a foreign key, matching trade_plans.signal_id's own
-- convention in 0045) so a scan-time evaluation can be persisted before any
-- trade_plan exists for it. trade_plans gains reference columns so a
-- generated plan can point back at the evaluation snapshot it was informed
-- by, without duplicating the payload.
--
-- Rollback: `alter table public.trade_plans drop column if exists
-- gann_alignment, drop column if exists sara_alignment, drop column if
-- exists gann_module_version, drop column if exists sara_module_version,
-- drop column if exists gann_evaluation_id, drop column if exists
-- sara_evaluation_id; drop table if exists public.sara_evaluations; drop
-- table if exists public.gann_evaluations; drop table if exists
-- public.strategy_modules;`. Additive only -- no existing table is altered
-- beyond the new nullable columns on trade_plans.

create table if not exists public.strategy_modules (
  module_id text primary key,
  module_type text not null check (module_type in ('gann', 'sara', 'core')),
  display_name text not null,
  authorized_source text not null,
  version text not null,
  enabled_by_market text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'disabled', 'deprecated')),
  owner text not null default 'GSPS',
  created_at timestamptz not null default now()
);

insert into public.strategy_modules
  (module_id, module_type, display_name, authorized_source, version, enabled_by_market, status, owner)
values
  (
    'gann_confluence_layer',
    'gann',
    'Gann Confluence Layer',
    'lib/gann/squareOf9.ts, lib/gann/fans.ts, lib/gann/timeCycles.ts — independently implemented public-domain Gann techniques',
    '0.1.0',
    array['equities', 'crypto'],
    'active',
    'GSPS'
  ),
  (
    'sara_sniper_confluence_layer',
    'sara',
    'Sara Sniper Strat Confluence Layer',
    'lib/strat/patterns.ts closed-bar reversal/continuation taxonomy (2-2, 1-2-2, 3-2-2, 2-1-2, 3-1-2, PMG)',
    '0.1.0',
    array['equities', 'crypto'],
    'active',
    'GSPS'
  )
on conflict (module_id) do nothing;

create table if not exists public.gann_evaluations (
  id uuid primary key default gen_random_uuid (),
  signal_id text not null,
  user_id uuid references auth.users (id) on delete cascade,
  symbol text not null,
  market text not null,
  root numeric,
  digit_inputs jsonb not null default '{}',
  harmonic_vectors jsonb not null default '[]',
  -- Personally sourced Material Number vs Harmonic Node classification is
  -- pending an authorized written specification (see the addendum) -- always
  -- 'not_implemented' until that specification exists and is reviewed.
  node_classification text not null default 'not_implemented'
    check (node_classification in ('not_implemented')),
  coordinate_outputs jsonb not null default '{}',
  alignment_state text not null check (alignment_state in ('aligned', 'conflict', 'neutral', 'not_implemented')),
  calculation_version text not null,
  payload_snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists gann_evaluations_signal_idx
  on public.gann_evaluations (signal_id);

create index if not exists gann_evaluations_user_idx
  on public.gann_evaluations (user_id);

alter table public.gann_evaluations enable row level security;

create policy "own or system gann evaluations" on public.gann_evaluations
  for select using (user_id is null or auth.uid () = user_id);

create policy "insert own gann evaluations" on public.gann_evaluations
  for insert with check (user_id is null or auth.uid () = user_id);

create table if not exists public.sara_evaluations (
  id uuid primary key default gen_random_uuid (),
  signal_id text not null,
  user_id uuid references auth.users (id) on delete cascade,
  symbol text not null,
  market text not null,
  scenario_id text,
  timeframe_states jsonb not null default '{}',
  confirmation_state text not null check (confirmation_state in ('closed_bar_confirmed', 'no_armed_scenario', 'not_implemented')),
  alignment_state text not null check (alignment_state in ('aligned', 'conflict', 'neutral', 'not_implemented')),
  strategy_version text not null,
  payload_snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists sara_evaluations_signal_idx
  on public.sara_evaluations (signal_id);

create index if not exists sara_evaluations_user_idx
  on public.sara_evaluations (user_id);

alter table public.sara_evaluations enable row level security;

create policy "own or system sara evaluations" on public.sara_evaluations
  for select using (user_id is null or auth.uid () = user_id);

create policy "insert own sara evaluations" on public.sara_evaluations
  for insert with check (user_id is null or auth.uid () = user_id);

-- trade_plans already carries `regime`/`alignment` jsonb evidence (0045) for
-- the four generic scanner states; extend it with the two confluence
-- modules' own alignment reads and module versions so a plan's full evidence
-- trace -- including non-overridable safety-gate results already captured by
-- the existing `regime`/`alignment` columns -- is reconstructible from
-- stored inputs alone.
alter table public.trade_plans
  add column if not exists gann_alignment jsonb,
  add column if not exists sara_alignment jsonb,
  add column if not exists gann_module_version text,
  add column if not exists sara_module_version text,
  add column if not exists gann_evaluation_id uuid references public.gann_evaluations (id) on delete set null,
  add column if not exists sara_evaluation_id uuid references public.sara_evaluations (id) on delete set null;

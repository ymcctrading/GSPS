-- Novice Risk, Account & Cooldown Engine — persistence for lib/risk/*.
-- Additive only; nothing here is wired to a route yet. The engine's decision
-- logic (circuit-breaker state machine, dynamic-risk sizing, cooldown gating)
-- lives in lib/risk/ and is pure/stateless — these three tables are only the
-- record of what it decided, for the state machine's own duration holds
-- (risk_circuit_state) and for the audit trail the spec requires on every
-- transition (risk_circuit_audit_log), plus the reset checklist required
-- before new entries resume out of a hard cooldown or lock
-- (risk_reset_checklists).
--
-- Same posture as 0036: RLS enabled, a "select own rows" policy, and no
-- insert/update/delete policy at all -- only service_role (server routes
-- that have already run the lib/risk/* logic) may write. A client inserting
-- its own circuit state or checklist would let it pick its own risk band.
--
-- Rollback: `drop table if exists public.risk_reset_checklists,
-- public.risk_circuit_audit_log, public.risk_circuit_state cascade;`

create table public.risk_circuit_state (
  profile_id uuid primary key references auth.users (id) on delete cascade,
  state text not null check (
    state in (
      'normal', 'entry_pause', 'warning', 'soft_cooldown', 'hard_cooldown',
      'critical_lock', 'emergency_lock', 'severe_override'
    )
  ),
  -- When the current state was first triggered -- what a duration-gated hold
  -- (hard_cooldown and above) counts trading days from. Reset every time the
  -- state actually changes, not on every re-evaluation of an unchanged state.
  triggered_at timestamptz not null default now(),
  reason text not null,
  updated_at timestamptz not null default now()
);

alter table public.risk_circuit_state enable row level security;

create policy "own risk circuit state" on public.risk_circuit_state
  for select using (auth.uid () = profile_id);

-- ============ risk_circuit_audit_log ============
-- One row per state transition (lib/risk/audit.ts `buildAuditRecord`,
-- written only when `isTransition` is true -- a re-evaluation that holds the
-- same state is not logged again). `metric_inputs` is the CircuitInputs the
-- decision was made from, verbatim, so a maintainer reading a transition can
-- see exactly what tripped it without recomputing it from raw trade history.
create table public.risk_circuit_audit_log (
  id uuid primary key default gen_random_uuid (),
  profile_id uuid not null references auth.users (id) on delete cascade,
  prior_state text,
  new_state text not null check (
    new_state in (
      'normal', 'entry_pause', 'warning', 'soft_cooldown', 'hard_cooldown',
      'critical_lock', 'emergency_lock', 'severe_override'
    )
  ),
  reason text not null,
  metric_inputs jsonb not null,
  source_data_confidence text not null check (source_data_confidence in ('verified', 'estimate', 'stale')),
  user_notified boolean not null default false,
  user_acknowledged_at timestamptz,
  occurred_at timestamptz not null default now()
);

create index risk_circuit_audit_log_profile_occurred_idx
  on public.risk_circuit_audit_log (profile_id, occurred_at desc);

alter table public.risk_circuit_audit_log enable row level security;

create policy "own risk circuit audit log" on public.risk_circuit_audit_log
  for select using (auth.uid () = profile_id);

-- ============ risk_reset_checklists ============
-- One row per completed reset, required (lib/risk/cooldown.ts
-- `requiresResetChecklist`) before new entries resume out of hard_cooldown
-- or any lock above it. `circuit_audit_log_id` ties the checklist to the
-- transition it is resetting out of, so the audit trail reads as one story
-- rather than two tables a maintainer has to correlate by timestamp.
create table public.risk_reset_checklists (
  id uuid primary key default gen_random_uuid (),
  profile_id uuid not null references auth.users (id) on delete cascade,
  circuit_audit_log_id uuid references public.risk_circuit_audit_log (id) on delete set null,
  account_value numeric not null,
  current_open_risk_usd numeric not null,
  rule_breach text,
  correlation_exposure text not null,
  revised_plan text not null,
  completed_at timestamptz not null default now()
);

create index risk_reset_checklists_profile_completed_idx
  on public.risk_reset_checklists (profile_id, completed_at desc);

alter table public.risk_reset_checklists enable row level security;

create policy "own risk reset checklists" on public.risk_reset_checklists
  for select using (auth.uid () = profile_id);

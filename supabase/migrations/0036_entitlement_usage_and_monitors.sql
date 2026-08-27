-- Phase 3B: schema for the entitlement system described in
-- GSPS_TIER_ENTITLEMENT_SPEC.md / docs/GSPS_TIER_ENTITLEMENT_SPEC.md.
-- Additive only. Nothing here is wired to a route yet (that's Phase 3C+);
-- this migration only creates the tables, constraints, RLS, and the two
-- quota-reservation RPCs Phase 3C needs immediately.
--
-- Six tables, matching the "Required database additions" list in
-- GSPS_CLAUDE_CODE_IMPLEMENTATION_HANDOFF.md:
--   usage_ledger            - atomic daily quota reservation + audit
--   scan_executions         - one row per scan run (system or user-initiated)
--   visible_scan_results    - only the results a plan actually let a user see
--   active_monitors         - current Watch/Execute candidates
--   monitor_transitions     - idempotency ledger for state changes
--   notification_deliveries - idempotency ledger for alert delivery
--
-- All six carry a service-role-only mutation policy (RLS enabled, a
-- `select own rows` policy, and no insert/update/delete policy at all) --
-- consistent with "Clients must not insert/update tiers, usage rows,
-- monitor states, transitions, or delivery statuses" in the Phase 1
-- instructions. Only `service_role` (which bypasses RLS) or the two
-- SECURITY INVOKER functions below may write to usage_ledger; the other
-- four tables are schema + RLS only in this migration -- their own
-- server-only mutation RPCs land in Phase 3E once the monitor lifecycle
-- rules (cooldown, invalidation precedence) that shape them are decided,
-- rather than guessing that shape now.
--
-- Rollback: `drop table if exists public.notification_deliveries,
-- public.monitor_transitions, public.active_monitors,
-- public.visible_scan_results, public.scan_executions, public.usage_ledger
-- cascade; drop type if exists public.monitor_state;
-- drop function if exists public.reserve_usage_slot(uuid, text, date, uuid, int);
-- drop function if exists public.finalize_usage_reservation(uuid, uuid, text);`

create type public.monitor_state as enum (
  'WATCH', 'EXECUTE', 'INVALIDATED', 'NO_SETUP', 'EXPIRED'
);

-- ============ usage_ledger ============
-- One row per reserved unit of manual-dashboard or guided-scan quota for a
-- profile on a given America/New_York day. `request_id` is the caller's
-- idempotency key (e.g. a request-scoped UUID the route generates once and
-- retries reuse) -- a retry of the same request never reserves twice.
create table public.usage_ledger (
  id uuid primary key default gen_random_uuid (),
  profile_id uuid not null references auth.users (id) on delete cascade,
  usage_key text not null check (usage_key in ('manual_dashboard_scan', 'guided_scan')),
  usage_day_et date not null,
  request_id uuid not null,
  status text not null default 'reserved' check (status in ('reserved', 'finalized', 'released')),
  reserved_at timestamptz not null default now(),
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, request_id)
);

-- Counts today's reservations for a profile+key when deciding whether a new
-- one fits under the plan's daily limit -- see reserve_usage_slot below.
create index usage_ledger_quota_count_idx
  on public.usage_ledger (profile_id, usage_key, usage_day_et)
  where status in ('reserved', 'finalized');

alter table public.usage_ledger enable row level security;

create policy "own usage ledger" on public.usage_ledger
  for select using (auth.uid () = profile_id);

-- ============ scan_executions ============
-- profile_id is null for a scheduled system job (6:00/9:15 ET scans), which
-- is how a scheduled run is distinguished from a user-initiated one without
-- a separate boolean that could disagree with `source`.
create table public.scan_executions (
  id uuid primary key default gen_random_uuid (),
  profile_id uuid references auth.users (id) on delete cascade,
  source text not null check (
    source in (
      'manual_dashboard', 'guided', 'automation', 'intraday', 'backtest',
      'scheduled_morning_scan', 'scheduled_morning_confirmation_scan'
    )
  ),
  policy_version text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  eligible_count int not null default 0 check (eligible_count >= 0),
  visible_count int not null default 0 check (visible_count >= 0),
  result_fresh_as_of timestamptz,
  created_at timestamptz not null default now()
);

create index scan_executions_profile_started_idx
  on public.scan_executions (profile_id, started_at desc);

alter table public.scan_executions enable row level security;

create policy "own scan executions" on public.scan_executions
  for select using (auth.uid () = profile_id);

-- ============ visible_scan_results ============
-- Only what the entitlement result-visibility cap actually let the profile
-- see -- the setups a scan computed but did not return are never persisted
-- here or anywhere else the client can reach.
create table public.visible_scan_results (
  id uuid primary key default gen_random_uuid (),
  scan_execution_id uuid not null references public.scan_executions (id) on delete cascade,
  profile_id uuid not null references auth.users (id) on delete cascade,
  symbol text not null,
  side text not null check (side in ('buy', 'sell')),
  rank int not null check (rank >= 1),
  visible_at timestamptz not null default now()
);

create index visible_scan_results_execution_idx
  on public.visible_scan_results (scan_execution_id);
create index visible_scan_results_profile_visible_idx
  on public.visible_scan_results (profile_id, visible_at desc);

alter table public.visible_scan_results enable row level security;

create policy "own visible scan results" on public.visible_scan_results
  for select using (auth.uid () = profile_id);

-- ============ active_monitors ============
-- At most one open (WATCH/EXECUTE) monitor per profile+symbol -- the
-- partial unique index is what makes that a database guarantee rather than
-- an application convention a race could violate.
create table public.active_monitors (
  id uuid primary key default gen_random_uuid (),
  profile_id uuid not null references auth.users (id) on delete cascade,
  symbol text not null,
  source text not null check (
    source in (
      'manual_dashboard', 'guided', 'automation', 'intraday',
      'scheduled_morning_scan', 'scheduled_morning_confirmation_scan'
    )
  ),
  state public.monitor_state not null default 'WATCH',
  policy_version text,
  last_evaluated_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index active_monitors_open_unique
  on public.active_monitors (profile_id, symbol)
  where state in ('WATCH', 'EXECUTE');
create index active_monitors_profile_state_idx
  on public.active_monitors (profile_id, state);

alter table public.active_monitors enable row level security;

create policy "own active monitors" on public.active_monitors
  for select using (auth.uid () = profile_id);

-- ============ monitor_transitions ============
-- `transition_key` is the idempotency boundary: a polling job, retry, or
-- duplicate evaluation that produces the same key can attempt to insert
-- again, but the unique constraint -- not application logic -- is what
-- guarantees it lands once. profile_id is denormalized from the owning
-- monitor so RLS here doesn't need a join.
create table public.monitor_transitions (
  id uuid primary key default gen_random_uuid (),
  monitor_id uuid not null references public.active_monitors (id) on delete cascade,
  profile_id uuid not null references auth.users (id) on delete cascade,
  prior_state public.monitor_state,
  new_state public.monitor_state not null,
  transition_key text not null,
  occurred_at timestamptz not null default now(),
  unique (transition_key)
);

create index monitor_transitions_monitor_idx
  on public.monitor_transitions (monitor_id, occurred_at desc);

alter table public.monitor_transitions enable row level security;

create policy "own monitor transitions" on public.monitor_transitions
  for select using (auth.uid () = profile_id);

-- ============ notification_deliveries ============
-- Reuses notification_channel/notification_status from 0022_notifications.sql
-- rather than declaring a parallel enum for the same concept.
create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid (),
  transition_id uuid not null references public.monitor_transitions (id) on delete cascade,
  profile_id uuid not null references auth.users (id) on delete cascade,
  channel notification_channel not null,
  idempotency_key text not null,
  status notification_status not null default 'pending',
  provider_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (idempotency_key)
);

create index notification_deliveries_profile_created_idx
  on public.notification_deliveries (profile_id, created_at desc);

alter table public.notification_deliveries enable row level security;

create policy "own notification deliveries" on public.notification_deliveries
  for select using (auth.uid () = profile_id);

-- ============ reserve_usage_slot ============
-- Atomically reserves one unit of `p_usage_key` quota for `p_profile_id` on
-- `p_usage_day_et`, or reports it as exhausted, or replays an existing
-- reservation for the same `p_request_id` (idempotent retry).
--
-- Unlike 0011/0012's atomic functions, the first reservation of a day has no
-- existing row to `select ... for update` -- so concurrent first-reservations
-- for the same profile+key+day would both read count=0 and both insert,
-- overspending the quota by one. `pg_advisory_xact_lock` serializes callers
-- on that profile+key+day for the duration of the transaction instead; it
-- releases automatically on commit or rollback.
--
-- `p_limit` is the caller's resolved EntitlementPolicy limit for this profile
-- (an integer, or null for "unlimited") -- this function enforces whatever
-- limit it is given and does not resolve a tier itself. The caller (a
-- trusted server route) is responsible for resolving the profile's tier via
-- lib/entitlements/policy.ts and never accepting a client-supplied limit.
create or replace function public.reserve_usage_slot(
  p_profile_id uuid,
  p_usage_key text,
  p_usage_day_et date,
  p_request_id uuid,
  p_limit int default null
)
returns table (reservation_id uuid, status text, current_count int, was_duplicate boolean)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_existing record;
  v_count int;
  v_new_id uuid;
begin
  select id, status into v_existing
  from public.usage_ledger
  where profile_id = p_profile_id and request_id = p_request_id;

  if found then
    select count(*) into v_count
    from public.usage_ledger
    where profile_id = p_profile_id and usage_key = p_usage_key and usage_day_et = p_usage_day_et
      and status in ('reserved', 'finalized');

    return query select v_existing.id, v_existing.status, v_count, true;
    return;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_profile_id::text || ':' || p_usage_key || ':' || p_usage_day_et::text, 0)
  );

  select count(*) into v_count
  from public.usage_ledger
  where profile_id = p_profile_id and usage_key = p_usage_key and usage_day_et = p_usage_day_et
    and status in ('reserved', 'finalized');

  if p_limit is not null and v_count >= p_limit then
    return query select null::uuid, 'quota_exceeded'::text, v_count, false;
    return;
  end if;

  insert into public.usage_ledger (profile_id, usage_key, usage_day_et, request_id, status)
  values (p_profile_id, p_usage_key, p_usage_day_et, p_request_id, 'reserved')
  returning id into v_new_id;

  return query select v_new_id, 'reserved'::text, v_count + 1, false;
end;
$$;

-- ============ finalize_usage_reservation ============
-- Marks a `reserved` row `finalized` (a valid result was produced) or
-- `released` (no valid result -- the reservation should not count against
-- future-day quota reasoning, though the row itself stays for audit). A
-- no-op if the reservation is missing, already resolved, or owned by a
-- different profile -- callers should treat a false return as "nothing to
-- finalize" rather than an error.
create or replace function public.finalize_usage_reservation(
  p_profile_id uuid,
  p_reservation_id uuid,
  p_status text
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_updated int;
begin
  if p_status not in ('finalized', 'released') then
    raise exception 'finalize_usage_reservation: invalid status %', p_status
      using errcode = '22023';
  end if;

  update public.usage_ledger
  set status = p_status, finalized_at = now(), updated_at = now()
  where id = p_reservation_id and profile_id = p_profile_id and status = 'reserved';

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

-- Both functions are SECURITY INVOKER, so leaving them at Postgres's default
-- PUBLIC execute grant would reproduce exactly the exposure Phase 0
-- (docs/operations/PHASE_0_SECURITY_DEFINER_RPC_ROLLOUT.md /
-- PHASE_0_SECURITY_DEFINER_RPC_ROLLOUT.md) locks down elsewhere: any
-- authenticated user could call reserve_usage_slot directly over PostgREST
-- with an arbitrary p_limit, bypassing the server route that is supposed to
-- resolve that limit from the profile's actual tier. Restrict execution to
-- service_role from the moment these functions exist, the same as the six
-- functions Phase 0 corrects retroactively.
revoke execute on function public.reserve_usage_slot(uuid, text, date, uuid, int) from public, anon, authenticated;
grant execute on function public.reserve_usage_slot(uuid, text, date, uuid, int) to service_role;

revoke execute on function public.finalize_usage_reservation(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.finalize_usage_reservation(uuid, uuid, text) to service_role;

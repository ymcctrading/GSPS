-- Fixes a bug in 0036_entitlement_usage_and_monitors.sql's
-- reserve_usage_slot(): `returns table (reservation_id uuid, status text,
-- current_count int, was_duplicate boolean)` implicitly declares `status`
-- as a PL/pgSQL variable inside the function body -- which collides with
-- usage_ledger.status, referenced unqualified in the original body's
-- `select id, status into v_existing` and `where status in (...)` clauses.
-- Every call failed with "42702: column reference "status" is ambiguous"
-- (confirmed live against production; this is what broke the guided scan
-- and manual dashboard scan the moment they actually called this function
-- for real -- lib/entitlements/quota.ts's unit tests mock the RPC call
-- entirely, so they never exercised the real function body).
--
-- Fix: alias the table in every reference (`ul.status`, `ul.id`, ...) so
-- there is nothing left for Postgres to disambiguate, and select the
-- existing row's id/status into two named scalar variables instead of a
-- record (removes any doubt about which `.status` a later reference means).
--
-- Signature is unchanged, so this create-or-replace preserves the existing
-- service_role-only grant from 0036 automatically -- verified after
-- applying, not assumed.
--
-- Rollback: revert to 0036's original (broken) body -- there is no reason
-- to; this is a straight bugfix with no behavior change beyond "it now
-- works".

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
  v_existing_id uuid;
  v_existing_status text;
  v_count int;
  v_new_id uuid;
begin
  select ul.id, ul.status into v_existing_id, v_existing_status
  from public.usage_ledger ul
  where ul.profile_id = p_profile_id and ul.request_id = p_request_id;

  if found then
    select count(*) into v_count
    from public.usage_ledger ul
    where ul.profile_id = p_profile_id and ul.usage_key = p_usage_key and ul.usage_day_et = p_usage_day_et
      and ul.status in ('reserved', 'finalized');

    return query select v_existing_id, v_existing_status, v_count, true;
    return;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_profile_id::text || ':' || p_usage_key || ':' || p_usage_day_et::text, 0)
  );

  select count(*) into v_count
  from public.usage_ledger ul
  where ul.profile_id = p_profile_id and ul.usage_key = p_usage_key and ul.usage_day_et = p_usage_day_et
    and ul.status in ('reserved', 'finalized');

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

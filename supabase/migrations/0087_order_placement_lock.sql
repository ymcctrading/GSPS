-- One new entry at a time per account (senior review F-05).
--
-- `placeSimulatedOrder` reads the open positions, checks Gann's capital rules
-- (five stocks, 30 points a share, a tenth at risk) and then writes the order,
-- in application code. Two orders placed at once (two tabs, Guided and the
-- portfolio manager) could each read the book before the other wrote and both
-- pass. A short lease per user closes that gap: the order path takes it before
-- the checks and gives it back after the write (lib/trade/order-lock.ts).
--
-- A lease rather than an advisory lock because the app talks to Postgres
-- through PostgREST, one statement per request, so no transaction spans the
-- checks and the write. The lease expires on its own, so a crashed request
-- never holds an account for longer than `p_ttl_seconds`.
--
-- Protective orders (a stop, a close) never take it, so nothing here can
-- stand between a trader and getting out.

create table if not exists public.order_placement_locks (
  user_id uuid primary key references auth.users (id) on delete cascade,
  token uuid not null,
  locked_until timestamptz not null
);

alter table public.order_placement_locks enable row level security;
-- No policies: rows are reached only through the two functions below.

create or replace function public.try_acquire_order_lock(
  p_user_id uuid,
  p_token uuid,
  p_ttl_seconds integer default 30
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  acquired boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role' and p_user_id is distinct from auth.uid() then
    raise exception 'order lock: not your account' using errcode = '42501';
  end if;
  insert into public.order_placement_locks as l (user_id, token, locked_until)
  values (p_user_id, p_token, now() + make_interval(secs => greatest(1, least(p_ttl_seconds, 120))))
  on conflict (user_id) do update
    set token = excluded.token, locked_until = excluded.locked_until
    where l.locked_until < now()
  returning true into acquired;
  return coalesce(acquired, false);
end;
$$;

create or replace function public.release_order_lock(
  p_user_id uuid,
  p_token uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and p_user_id is distinct from auth.uid() then
    raise exception 'order lock: not your account' using errcode = '42501';
  end if;
  delete from public.order_placement_locks where user_id = p_user_id and token = p_token;
end;
$$;

revoke execute on function public.try_acquire_order_lock(uuid, uuid, integer) from public, anon;
revoke execute on function public.release_order_lock(uuid, uuid) from public, anon;
grant execute on function public.try_acquire_order_lock(uuid, uuid, integer) to authenticated, service_role;
grant execute on function public.release_order_lock(uuid, uuid) to authenticated, service_role;

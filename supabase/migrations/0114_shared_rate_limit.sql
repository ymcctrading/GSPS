-- Q2 item 7, "Scale safely": one rate-limit count across every server
-- instance, for the heavy buckets only (owner's pick, 2026-10-22: "Postgres,
-- heavy routes only").
--
-- The proxy's limiter kept its counts per serverless instance
-- (lib/rate-limit.ts), so a caller spread over several instances got several
-- budgets. The credential, outbound, order and scan buckets
-- (lib/rate-limit-policy.ts) now count here instead: a password guess, an
-- email, a ledger write or a vendor read. The `api` bucket (reads of a
-- member's own rows, the bulk of traffic) stays per instance, so ordinary
-- browsing adds no database round trip.
--
-- Unlogged: a count lost in a crash only resets a one-minute window, and an
-- unlogged write skips the WAL. Only the service role may call the function,
-- since a key is a user id or an address and anyone who could call it could
-- spend another member's budget.
--
-- Rollback:
--   drop function if exists public.rate_limit_hit(text, integer, integer);
--   drop table if exists public.rate_limit_buckets;

create unlogged table if not exists public.rate_limit_buckets (
  key text primary key,
  count integer not null,
  reset_at timestamptz not null
);

alter table public.rate_limit_buckets enable row level security;
revoke all on public.rate_limit_buckets from anon, authenticated;

create or replace function public.rate_limit_hit(p_key text, p_limit integer, p_window_ms integer)
returns table (allowed boolean, remaining integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_reset timestamptz;
begin
  insert into public.rate_limit_buckets as b (key, count, reset_at)
  values (p_key, 1, now() + make_interval(secs => p_window_ms / 1000.0))
  on conflict (key) do update
    set count = case when b.reset_at <= now() then 1 else b.count + 1 end,
        reset_at = case when b.reset_at <= now() then excluded.reset_at else b.reset_at end
  returning b.count, b.reset_at into v_count, v_reset;

  -- Expired windows are cleared now and then, about one call in a hundred,
  -- so the table holds roughly the last minute's callers.
  if random() < 0.01 then
    delete from public.rate_limit_buckets where public.rate_limit_buckets.reset_at < now() - interval '1 minute';
  end if;

  return query select v_count <= p_limit, greatest(0, p_limit - v_count), v_reset;
end;
$$;

revoke execute on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;

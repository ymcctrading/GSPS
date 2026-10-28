-- GSPS — 0126: a daily email budget, so the key emails always have room
--
-- Owner, 2026-10-28 (item 6): "Have gone thru our email limit almost everyday
-- recently. Determine a plan to send only the most pertinent notifications via
-- email….everything else should be a mobile/in platform notification." Measured
-- the same night: the provider refused sends once about 200 had gone out in a
-- UTC day (10-23 and 10-26), and intraday signals were about 90% of them.
-- Intraday signals now go by push and the bell only (owner's "Yes", 2026-10-28);
-- this ledger is the backstop for everything still emailed.
--
-- One row a UTC day (the provider's quota day). `reserve_email_send` takes one
-- slot if the day's count is under the caller's limit and returns whether it
-- did; the limit is passed in by the server (lib/notifications/email-budget.ts:
-- a member's own trades and ops get a higher ceiling than alerts and digests,
-- so they still go out when the rest is spent). A reserved slot is not handed
-- back when the send then fails: the count is a ceiling, not a receipt.
--
-- Service role only: RLS on with no policy, and execute revoked from members.
--
-- Rollback:
--   drop function if exists public.reserve_email_send(integer);
--   drop table if exists public.email_daily_budget;


create table if not exists public.email_daily_budget (
  day date primary key,
  sent integer not null default 0 check (sent >= 0),
  updated_at timestamptz not null default now()
);

alter table public.email_daily_budget enable row level security;

create or replace function public.reserve_email_send(p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_day date := (now() at time zone 'UTC')::date;
  v_taken integer;
begin
  if p_limit is null or p_limit <= 0 then
    return false;
  end if;
  insert into public.email_daily_budget as b (day, sent)
  values (v_day, 1)
  on conflict (day) do update
    set sent = b.sent + 1, updated_at = now()
    where b.sent < p_limit
  returning sent into v_taken;
  return v_taken is not null;
end;
$$;

revoke all on table public.email_daily_budget from public, anon, authenticated;
revoke execute on function public.reserve_email_send(integer) from public, anon, authenticated;
grant execute on function public.reserve_email_send(integer) to service_role;

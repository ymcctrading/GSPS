-- GSPS — more free-tier limits on the usage meter (migration 0133,
-- lib/ops/usageLimits.ts): Supabase connections, file storage and monthly
-- active users, and Alpaca's per-minute data allowance.
--
--   usage_events      now also takes 'alpaca_rate' rows: `units` is the
--                     busiest minute a scan saw, from Alpaca's rate headers.
--   usage_max()       a meter's largest reading over a window (the month's
--                     busiest minute).
--   usage_supabase()  connections now, file storage in bytes, and users
--                     signed in since the start of the UTC month.
-- Service role only, as 0133's functions.

alter table public.usage_events drop constraint if exists usage_events_meter_check;
alter table public.usage_events add constraint usage_events_meter_check
  check (meter in ('github_actions', 'vercel_deployments', 'alpaca_rate'));

create or replace function public.usage_max(p_meter text, p_since timestamptz, p_until timestamptz)
returns numeric
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(max(units), 0) from public.usage_events
  where meter = p_meter and occurred_at >= p_since and occurred_at <= p_until;
$fn$;

revoke execute on function public.usage_max(text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.usage_max(text, timestamptz, timestamptz) to service_role;

create or replace function public.usage_supabase()
returns jsonb
language sql
stable
security definer
set search_path = public
as $fn$
  select jsonb_build_object(
    'connections', (select count(*) from pg_stat_activity where datname = current_database()),
    -- A size that is missing or not a whole number counts as 0, never an
    -- error: one bad row must not leave all three meters unread.
    'storage_bytes', (select coalesce(sum(case when metadata->>'size' ~ '^[0-9]{1,18}$' then (metadata->>'size')::bigint else 0 end), 0) from storage.objects),
    'mau', (select count(*) from auth.users where last_sign_in_at >= date_trunc('month', now() at time zone 'UTC') at time zone 'UTC')
  );
$fn$;

revoke execute on function public.usage_supabase() from public, anon, authenticated;
grant execute on function public.usage_supabase() to service_role;

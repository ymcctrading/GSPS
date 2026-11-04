-- GSPS — the usage meter learns Vercel's function limits (2026-11-04).
--
-- Why: on Nov 3–4 2026 Vercel blocked the whole account ("Payment required",
-- DEPLOYMENT_DISABLED). The Hobby plan can't bill overage, so a monthly
-- function limit that runs out stops every deployment. The meter (0133, 0137)
-- watched Vercel deployments only, so nothing warned. Vercel offers a free
-- plan no usage API, so the app now measures its own scheduled calls.
--
--   usage_events      now also takes 'vercel_function' rows: one row per
--                     scheduled route per UTC day, kept by usage_function_add().
--                     `units` is the CPU minutes those calls used (the Node
--                     process's own CPU time while each ran: an upper bound,
--                     since calls sharing an instance are counted in each);
--                     detail.invocations and detail.wall_seconds are the
--                     calls and their wall-clock time. About 20 rows a day.
--   usage_function_add()     adds one call to its route's row for the day.
--   usage_function_totals()  a window's CPU minutes, calls and wall seconds.
--   gsps_ops.call_endpoint() skips a scheduled call while either Vercel
--                     function meter holds (usage_readings.hold, written by
--                     the hourly check). The usage check itself always runs,
--                     so the hold can lift. Holding at 99% is the owner's
--                     rule (2026-10-28) and the only thing that keeps the
--                     account from being blocked again.
--
-- To lift the hold by hand: insert a usage_overrides row for the meter
-- (owner's OK only), then call /api/ops/usage?check=1.

alter table public.usage_events drop constraint if exists usage_events_meter_check;
alter table public.usage_events add constraint usage_events_meter_check
  check (meter in ('github_actions', 'vercel_deployments', 'alpaca_rate', 'vercel_function'));

create or replace function public.usage_function_add(p_day date, p_path text, p_cpu_minutes numeric, p_wall_seconds numeric)
returns void
language sql
volatile
security definer
set search_path = public
as $fn$
  insert into public.usage_events (meter, units, key, detail, occurred_at)
  values (
    'vercel_function',
    greatest(coalesce(p_cpu_minutes, 0), 0),
    'fn-' || p_day::text || '-' || left(coalesce(p_path, 'unknown'), 120),
    jsonb_build_object('path', left(coalesce(p_path, 'unknown'), 120), 'invocations', 1, 'wall_seconds', greatest(coalesce(p_wall_seconds, 0), 0)),
    p_day::timestamptz
  )
  on conflict (key) do update set
    units = public.usage_events.units + excluded.units,
    detail = jsonb_build_object(
      'path', excluded.detail->'path',
      'invocations', coalesce((public.usage_events.detail->>'invocations')::numeric, 0) + 1,
      'wall_seconds', coalesce((public.usage_events.detail->>'wall_seconds')::numeric, 0) + (excluded.detail->>'wall_seconds')::numeric
    );
$fn$;

revoke execute on function public.usage_function_add(date, text, numeric, numeric) from public, anon, authenticated;
grant execute on function public.usage_function_add(date, text, numeric, numeric) to service_role;

create or replace function public.usage_function_totals(p_since timestamptz, p_until timestamptz)
returns table (cpu_minutes numeric, invocations numeric, wall_seconds numeric)
language sql
stable
security definer
set search_path = public
as $fn$
  select
    coalesce(sum(units), 0),
    coalesce(sum(coalesce((detail->>'invocations')::numeric, 0)), 0),
    coalesce(sum(coalesce((detail->>'wall_seconds')::numeric, 0)), 0)
  from public.usage_events
  where meter = 'vercel_function' and occurred_at >= p_since and occurred_at <= p_until;
$fn$;

revoke execute on function public.usage_function_totals(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.usage_function_totals(timestamptz, timestamptz) to service_role;

create or replace function gsps_ops.call_endpoint(p_path text)
 returns bigint
 language plpgsql
 set search_path to 'public', 'extensions'
as $function$
declare
  secret text;
  request_id bigint;
begin
  if p_path not like '/api/ops/usage%' and exists (
    select 1 from public.usage_readings
    where meter in ('vercel_cpu', 'vercel_invocations') and hold
  ) then
    raise notice 'gsps_ops.call_endpoint: Vercel function usage is held at 99%%; % not called', p_path;
    return null;
  end if;
  select decrypted_secret into secret
  from vault.decrypted_secrets
  where name = 'gsps_cron_secret'
  limit 1;
  if secret is null then
    raise notice 'gsps_ops.call_endpoint: vault secret gsps_cron_secret is missing; % not called', p_path;
    return null;
  end if;
  select net.http_get(
    url := 'https://gsps.vercel.app' || p_path,
    headers := jsonb_build_object('Authorization', 'Bearer ' || secret),
    timeout_milliseconds := 60000
  ) into request_id;
  return request_id;
end;
$function$;

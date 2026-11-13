-- GSPS — 0153: record what every scheduled call actually got back (2026-11-11)
--
-- NOT APPLIED. It replaces gsps_ops.call_endpoint and adds a schedule, so it
-- waits on the owner's word. Merging this file is not applying it.
--
-- Why: pg_cron marks a job "succeeded" once gsps_ops.call_endpoint has queued
-- its request, not when the app answered. pg_net writes the answer to
-- net._http_response, but keeps it only 6 hours (pg_net.ttl). So on Nov 10
-- the 5:20 PM ET card job showed "succeeded" and wrote no cards, and by the
-- next evening there was no record of why: the job was scheduled (0148, Nov 10
-- 21:33 UTC) before its route reached main (Nov 11 14:34 UTC) and before the
-- host address was set (0144, Nov 11 16:01 UTC), so it called the paused
-- fallback host. On Nov 11 the same job's request timed out at pg_net's 60
-- seconds (net._http_response id 14810) while the app went on and wrote its
-- cards. Neither case can be told from the run history.
--
-- What it does:
--   1. call_endpoint logs every call in gsps_ops.endpoint_calls: the path, the
--      request id, or why it was not called (the 99% hold, a missing secret).
--      Behaviour is otherwise unchanged; the one-argument form keeps the 60 s.
--   2. call_endpoint(path, timeout_ms) lets a long job (the engine card parts
--      on the temporary host) wait longer than 60 s, so a slow but finished
--      run is not recorded as a timeout. No schedule is changed here.
--   3. gsps_ops.sweep_endpoint_calls() copies each answer (status, timeout,
--      error, the first 300 characters of the body) from net._http_response
--      every 10 minutes, well inside the 6 hours; a call whose answer is gone
--      is marked so. It also deletes rows older than 30 days
--      (lib/ops/retention.ts, ENDPOINT_CALL_RETENTION_DAYS).
--   4. gsps_ops.endpoint_failures lists every call that was not made, timed
--      out, errored or answered outside 2xx.
--
-- A returning cycle, not a drain ("Cycles as architecture"): each sweep reads
-- what is unswept, so a missed tick is caught by the next. The 10 minutes and
-- 30 days are engineering choices, not Gann figures. About 100 calls a day,
-- some 3,000 rows kept.
--
-- Read it:
--   select called_at, path, coalesce(not_called, status_code::text, 'timed out') as result, left(error_msg, 80)
--     from gsps_ops.endpoint_failures where called_at > now() - interval '2 days' order by called_at desc;
--
-- Rollback:
--   select cron.unschedule('gsps-sweep-endpoint-calls');
--   (re-run 0144's call_endpoint definition)
--   drop function if exists gsps_ops.call_endpoint(text, integer);
--   drop function if exists gsps_ops.sweep_endpoint_calls();
--   drop view if exists gsps_ops.endpoint_failures;
--   drop table if exists gsps_ops.endpoint_calls;

create table if not exists gsps_ops.endpoint_calls (
  id bigint generated always as identity primary key,
  path text not null,
  called_at timestamptz not null default now(),
  request_id bigint unique,
  timeout_ms integer,
  not_called text,
  status_code integer,
  timed_out boolean,
  error_msg text,
  body_head text,
  swept_at timestamptz
);

create index if not exists endpoint_calls_unswept_idx on gsps_ops.endpoint_calls (called_at) where swept_at is null;

revoke all on table gsps_ops.endpoint_calls from public, anon, authenticated;

create or replace function gsps_ops.call_endpoint(p_path text, p_timeout_ms integer)
 returns bigint
 language plpgsql
 set search_path to 'public', 'extensions'
as $function$
declare
  secret text;
  base_url text;
  request_id bigint;
begin
  if p_path not like '/api/ops/usage%' and exists (
    select 1 from public.usage_readings
    where meter in ('vercel_cpu', 'vercel_invocations', 'cloud_run_seconds') and hold
  ) then
    raise notice 'gsps_ops.call_endpoint: function usage is held at 99%%; % not called', p_path;
    insert into gsps_ops.endpoint_calls (path, timeout_ms, not_called, swept_at)
    values (p_path, p_timeout_ms, 'usage held at 99%', now());
    return null;
  end if;
  select decrypted_secret into secret
  from vault.decrypted_secrets
  where name = 'gsps_cron_secret'
  limit 1;
  if secret is null then
    raise notice 'gsps_ops.call_endpoint: vault secret gsps_cron_secret is missing; % not called', p_path;
    insert into gsps_ops.endpoint_calls (path, timeout_ms, not_called, swept_at)
    values (p_path, p_timeout_ms, 'gsps_cron_secret missing', now());
    return null;
  end if;
  select rtrim(decrypted_secret, '/') into base_url
  from vault.decrypted_secrets
  where name = 'gsps_app_base_url'
  limit 1;
  select net.http_get(
    url := coalesce(nullif(base_url, ''), 'https://gsps.vercel.app') || p_path,
    headers := jsonb_build_object('Authorization', 'Bearer ' || secret),
    timeout_milliseconds := p_timeout_ms
  ) into request_id;
  insert into gsps_ops.endpoint_calls (path, request_id, timeout_ms) values (p_path, request_id, p_timeout_ms);
  return request_id;
end;
$function$;

-- Every existing schedule calls the one-argument form: same 60 seconds as before.
create or replace function gsps_ops.call_endpoint(p_path text)
 returns bigint
 language sql
 set search_path to 'public', 'extensions'
as $function$
  select gsps_ops.call_endpoint(p_path, 60000);
$function$;

create or replace function gsps_ops.sweep_endpoint_calls()
 returns integer
 language plpgsql
 set search_path to 'public', 'extensions'
as $function$
declare
  swept integer;
begin
  update gsps_ops.endpoint_calls c
     set status_code = r.status_code,
         timed_out = r.timed_out,
         error_msg = r.error_msg,
         body_head = left(r.content, 300),
         swept_at = now()
    from net._http_response r
   where r.id = c.request_id and c.swept_at is null;
  get diagnostics swept = row_count;
  -- pg_net answers within the call's timeout; one whose answer is still missing an hour after its timeout never will be read
  update gsps_ops.endpoint_calls
     set error_msg = 'no answer kept by pg_net', swept_at = now()
   where swept_at is null and called_at < now() - make_interval(secs => coalesce(timeout_ms, 60000) / 1000.0) - interval '1 hour';
  delete from gsps_ops.endpoint_calls where called_at < now() - interval '30 days';
  return swept;
end;
$function$;

create or replace view gsps_ops.endpoint_failures as
  select * from gsps_ops.endpoint_calls
   where not_called is not null
      or timed_out
      or error_msg is not null
      or (status_code is not null and status_code not between 200 and 299);

revoke all on function gsps_ops.call_endpoint(text, integer) from public, anon, authenticated;
revoke all on function gsps_ops.call_endpoint(text) from public, anon, authenticated;
revoke all on function gsps_ops.sweep_endpoint_calls() from public, anon, authenticated;
revoke all on gsps_ops.endpoint_failures from public, anon, authenticated;

select cron.schedule('gsps-sweep-endpoint-calls', '*/10 * * * *', $$select gsps_ops.sweep_endpoint_calls()$$);

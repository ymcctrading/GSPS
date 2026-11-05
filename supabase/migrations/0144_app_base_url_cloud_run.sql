-- The scheduled jobs' address, from one setting (2026-11-04).
--
-- Vercel paused the Hobby account on 2026-10-31 for Fluid Active CPU until
-- 2026-11-30, and the owner chose Google Cloud Run to keep the site up. Every
-- pg_cron job calls the app through gsps_ops.call_endpoint, which had the
-- Vercel address written in. It now reads the address from the Vault secret
-- `gsps_app_base_url` and falls back to https://gsps.vercel.app, so moving
-- host (to Cloud Run now, back to Vercel later if wanted) is one change:
--
--   select vault.create_secret('https://<service>.run.app', 'gsps_app_base_url');
--   -- or, once it exists:
--   select vault.update_secret(id, 'https://...') from vault.secrets where name = 'gsps_app_base_url';
--
-- The hold also reads the Cloud Run meter (`cloud_run_seconds`,
-- lib/ops/usageLimits.ts): at 99% of the free tier the scheduled jobs stop,
-- as they do at 99% of Vercel's.
--
-- The two schedules that lived in vercel.json move here, so every schedule is
-- in one place whatever the host: the evening market scan (00:00 UTC Tue-Sat)
-- and the trade journal digest (22:00 UTC weekdays). vercel.json drops its
-- crons in the same change, so neither runs twice.

create or replace function gsps_ops.call_endpoint(p_path text)
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
  select rtrim(decrypted_secret, '/') into base_url
  from vault.decrypted_secrets
  where name = 'gsps_app_base_url'
  limit 1;
  select net.http_get(
    url := coalesce(nullif(base_url, ''), 'https://gsps.vercel.app') || p_path,
    headers := jsonb_build_object('Authorization', 'Bearer ' || secret),
    timeout_milliseconds := 60000
  ) into request_id;
  return request_id;
end;
$function$;

select cron.schedule('gsps-evening-market-scan', '0 0 * * 2-6',  $$select gsps_ops.call_endpoint('/api/market-scan')$$);
select cron.schedule('gsps-trade-journal-digest', '0 22 * * 1-5', $$select gsps_ops.call_endpoint('/api/trade-journal/daily-email')$$);

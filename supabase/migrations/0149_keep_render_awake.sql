-- GSPS — 0149: keep the Render free instance awake (2026-11-11)
--
-- Vercel paused the Hobby account on 2026-10-31 until 2026-11-30, and Google
-- Cloud asked the owner for a $30 prepayment he declined ("I am not interested
-- in paying", 2026-11-11). The site moves to Render's free web service
-- (.github/workflows/deploy-render.yml), which needs no card but sleeps after
-- 15 minutes with no request and takes up to a minute to wake. pg_net gives a
-- scheduled call 60 seconds (gsps_ops.call_endpoint), so a cold start could
-- drop the evening scan or the 5:20 PM ET card run.
--
-- A returning cycle ("Cycles as architecture"): /api/health every 10 minutes,
-- around the clock, so the instance never reaches the 15-minute sleep. One
-- always-on service is 720 to 744 hours a month, inside Render's 750 free
-- instance hours. The 10 minutes is an engineering choice (under 15, with one
-- missed tick of slack), not a Gann figure.
--
-- The ping goes only where the scheduled jobs go: the Vault secret
-- `gsps_app_base_url` (0144). With no secret (the jobs fall back to Vercel,
-- which needs no waking) it does nothing, so moving back to Vercel after the
-- pause is deleting the secret, and this job then idles.

create or replace function gsps_ops.keep_awake()
 returns bigint
 language plpgsql
 set search_path to 'public', 'extensions'
as $function$
declare
  base_url text;
  request_id bigint;
begin
  select rtrim(decrypted_secret, '/') into base_url
  from vault.decrypted_secrets
  where name = 'gsps_app_base_url'
  limit 1;
  if nullif(base_url, '') is null then
    return null;
  end if;
  select net.http_get(url := base_url || '/api/health', timeout_milliseconds := 60000) into request_id;
  return request_id;
end;
$function$;

revoke all on function gsps_ops.keep_awake() from public, anon, authenticated;

select cron.schedule('gsps-keep-awake', '*/10 * * * *', $$select gsps_ops.keep_awake()$$);

-- Scheduled jobs run from the database (pg_cron + pg_net), not GitHub Actions.
--
-- GitHub runs scheduled workflows on a best-effort basis and drops most of
-- them under load: the portfolio manager's every-15-minutes schedule ran about
-- twice a day in October 2026 (paper-trading health check). Its plans last a
-- few session bars, so most armed and expired between looks. pg_cron runs on
-- time. Each job calls the same endpoint with the same bearer secret the
-- workflow sent, so nothing in the app changes.
--
-- A recurring process that returns rather than drains (AGENTS.md, "Cycles as
-- architecture"): every job re-derives its work from the database on each
-- call, so a missed or late call is recovered by the next one.
--
-- The secret is read from Supabase Vault at call time (name
-- 'gsps_cron_secret', the same value as the CRON_SECRET env var on Vercel);
-- it is never written into this file or the job table. Until that vault entry
-- exists every job does nothing. Schedules are in UTC, as GitHub's were.
-- The jobs run as the role that scheduled them (postgres), which reads the
-- vault, so the function runs as its caller and no other role may call it.

create schema if not exists gsps_ops;
revoke all on schema gsps_ops from public, anon, authenticated;

create or replace function gsps_ops.call_endpoint(p_path text)
returns bigint
language plpgsql
security invoker
set search_path = public, extensions
as $fn$
declare
  secret text;
  request_id bigint;
begin
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
$fn$;

revoke execute on function gsps_ops.call_endpoint(text) from public, anon, authenticated;

-- Same schedules as the workflows they replace (.github/workflows/*.yml).
select cron.schedule('gsps-portfolio-manager',        '*/15 13-21 * * 1-5',       $$select gsps_ops.call_endpoint('/api/automation/portfolio-manager/run')$$);
select cron.schedule('gsps-full-market-scan',         '*/15 13-21 * * 1-5',       $$select gsps_ops.call_endpoint('/api/market-scan')$$);
select cron.schedule('gsps-premarket-scan',           '30 12 * * 1-5',            $$select gsps_ops.call_endpoint('/api/market-scan')$$);
select cron.schedule('gsps-intraday-scan-session',    '*/15 13-21 * * 1-5',       $$select gsps_ops.call_endpoint('/api/intraday-scan')$$);
select cron.schedule('gsps-intraday-scan-crypto-wk',  '*/15 0-12,22-23 * * 1-5',  $$select gsps_ops.call_endpoint('/api/intraday-scan?universe=crypto')$$);
select cron.schedule('gsps-intraday-scan-crypto-we',  '*/15 * * * 0,6',           $$select gsps_ops.call_endpoint('/api/intraday-scan?universe=crypto')$$);
select cron.schedule('gsps-lifecycle-reaper',         '*/30 * * * *',             $$select gsps_ops.call_endpoint('/api/lifecycle/reaper')$$);
select cron.schedule('gsps-monitor-sweep',            '15,45 13-21 * * 1-5',      $$select gsps_ops.call_endpoint('/api/monitors/invalidation-sweep')$$);
select cron.schedule('gsps-price-alert-sweep',        '15,45 13-21 * * *',        $$select gsps_ops.call_endpoint('/api/price-alerts/sweep')$$);
select cron.schedule('gsps-notification-retry',       '0,30 10-23 * * 1-5',       $$select gsps_ops.call_endpoint('/api/notifications/retry-deliveries')$$);
select cron.schedule('gsps-morning-preparation-scan', '30 10 * * 1-5',            $$select gsps_ops.call_endpoint('/api/scans/morning-preparation')$$);
select cron.schedule('gsps-morning-confirmation',     '15 13 * * 1-5',            $$select gsps_ops.call_endpoint('/api/scans/morning-confirmation')$$);
select cron.schedule('gsps-first-90min-scan',         '45 13 * * 1-5',            $$select gsps_ops.call_endpoint('/api/scans/first-90min-confirmation')$$);
select cron.schedule('gsps-midday-scan',              '0 15 * * 1-5',             $$select gsps_ops.call_endpoint('/api/scans/midday')$$);
select cron.schedule('gsps-afternoon-scan',           '0 18 * * 1-5',             $$select gsps_ops.call_endpoint('/api/scans/afternoon')$$);
select cron.schedule('gsps-demo-auto-trade-1',        '35 12 * * 1-5',            $$select gsps_ops.call_endpoint('/api/demo/auto-trade')$$);
select cron.schedule('gsps-demo-auto-trade-2',        '0 17 * * 1-5',             $$select gsps_ops.call_endpoint('/api/demo/auto-trade')$$);
select cron.schedule('gsps-demo-auto-trade-3',        '30 19 * * 1-5',            $$select gsps_ops.call_endpoint('/api/demo/auto-trade')$$);

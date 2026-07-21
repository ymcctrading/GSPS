-- GSPS: schedule the market-close mean-reversion scan.
-- Applied 2026-07-21. Runs weekdays 20:15 UTC (~4:15pm ET during EDT).
-- For a fixed 4:15pm ET in winter (EST) use '15 21 * * 1-5'.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$ BEGIN
  PERFORM cron.unschedule('gsps-daily-scan');
EXCEPTION WHEN OTHERS THEN null; END $$;

-- NOTE: the apikey below is the project's *publishable* anon key (safe to store).
-- It is used only for edge-gateway routing; the function itself is verify_jwt=false
-- and optionally checks an x-cron-secret header (set CRON_SECRET in function env
-- and add the header here to lock it down further).
SELECT cron.schedule(
  'gsps-daily-scan',
  '15 20 * * 1-5',
  $$
  SELECT net.http_post(
    url := 'https://vebhpmmzxixlhujlptue.supabase.co/functions/v1/daily-scan',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', current_setting('gsps.anon_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Set the key once (kept out of the committed SQL body):
--   ALTER DATABASE postgres SET gsps.anon_key = '<publishable-anon-key>';

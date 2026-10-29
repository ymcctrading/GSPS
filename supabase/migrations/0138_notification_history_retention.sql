-- GSPS — 0138: keep the notification and transition history by age
--
-- The bell (in_app_notifications) and monitor_transitions grow with every
-- member: 884 bell rows and about 480 transitions a day across 23-24 members
-- (2026-10-29, 00:32 UTC). With the deliveries and the push log beside them
-- they are about 48 MB of the 132 MB database, and at 100 members they fill
-- the free tier's 500 MB in about four months (docs/CAPACITY_100_MEMBERS.md).
-- Nothing pruned them.
--
-- Kept (lib/ops/retention.ts holds the figures and why each clears its
-- readers; retention.test.ts holds this file to them):
--   in_app_notifications      30 days
--   notification_deliveries   90 days
--   monitor_transitions       90 days (its deliveries cascade, a bell row's
--                                      transition_id is set null)
--   notification_log          90 days
--   intraday_alerts           90 days
-- None is a trade record (S-07 keeps those indefinitely), and none is the
-- daily record of what was shown (visible_scan_daily) or of every Execute call
-- (shadow_signals).
--
-- A returning cycle, not a drain ("Cycles as architecture"): each run deletes
-- by age, so a missed night is caught by the next and a rerun deletes nothing.
--
-- Rollback:
--   select cron.unschedule('gsps-notification-retention');
--   drop function if exists gsps_ops.prune_notification_history();

create or replace function gsps_ops.prune_notification_history()
returns jsonb
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  bell int;
  deliveries int;
  transitions int;
  push_log int;
  alerts int;
begin
  delete from public.in_app_notifications where created_at < now() - interval '30 days';
  get diagnostics bell = row_count;

  delete from public.notification_deliveries where created_at < now() - interval '90 days';
  get diagnostics deliveries = row_count;

  delete from public.monitor_transitions where occurred_at < now() - interval '90 days';
  get diagnostics transitions = row_count;

  delete from public.notification_log where created_at < now() - interval '90 days';
  get diagnostics push_log = row_count;

  delete from public.intraday_alerts where created_at < now() - interval '90 days';
  get diagnostics alerts = row_count;

  return jsonb_build_object(
    'in_app_notifications', bell,
    'notification_deliveries', deliveries,
    'monitor_transitions', transitions,
    'notification_log', push_log,
    'intraday_alerts', alerts
  );
end;
$fn$;

revoke execute on function gsps_ops.prune_notification_history() from public, anon, authenticated;

-- 08:20 UTC daily: after the visible-scan rollup (08:00), before the
-- premarket scan.
select cron.schedule('gsps-notification-retention', '20 8 * * *', $$select gsps_ops.prune_notification_history()$$);

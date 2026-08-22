begin;

-- Phase 0: prevent public PostgREST execution of SECURITY DEFINER helpers.
-- Application code must use trusted server-side service-role paths for these functions.

revoke execute on function public.get_enabled_notification_channels(uuid) from anon, authenticated;
revoke execute on function public.get_equity_curve(uuid, numeric) from anon, authenticated;
revoke execute on function public.get_performance_by_pattern(uuid, date) from anon, authenticated;
revoke execute on function public.get_performance_metrics(uuid, date, date) from anon, authenticated;
revoke execute on function public.get_pnl_by_period(uuid, text, date) from anon, authenticated;
revoke execute on function public.is_in_quiet_hours(uuid) from anon, authenticated;
revoke execute on function public.referral_stats() from anon, authenticated;

grant execute on function public.get_enabled_notification_channels(uuid) to service_role;
grant execute on function public.get_equity_curve(uuid, numeric) to service_role;
grant execute on function public.get_performance_by_pattern(uuid, date) to service_role;
grant execute on function public.get_performance_metrics(uuid, date, date) to service_role;
grant execute on function public.get_pnl_by_period(uuid, text, date) to service_role;
grant execute on function public.is_in_quiet_hours(uuid) to service_role;
grant execute on function public.referral_stats() to service_role;

commit;

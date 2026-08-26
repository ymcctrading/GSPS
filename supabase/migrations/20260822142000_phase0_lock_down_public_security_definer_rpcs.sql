begin;

-- Phase 0: prevent public PostgREST execution of SECURITY DEFINER helpers.
-- Application code must use trusted server-side service-role paths for these functions.
--
-- referral_stats() is intentionally NOT included below. Unlike the other six,
-- it takes no caller-supplied user_id — it scopes itself internally via
-- auth.uid() (see 0035_referrals.sql) — so there is no cross-user read to
-- guard against. app/api/referral/route.ts calls it through the user-session
-- client (not service-role) by design, and 0035 grants it to `authenticated`
-- for exactly that reason. Revoking that grant here would silently zero out
-- every user's referral stats (the route doesn't check the RPC error before
-- calling .single()) for no security benefit.

revoke execute on function public.get_enabled_notification_channels(uuid) from anon, authenticated;
revoke execute on function public.get_equity_curve(uuid, numeric) from anon, authenticated;
revoke execute on function public.get_performance_by_pattern(uuid, date) from anon, authenticated;
revoke execute on function public.get_performance_metrics(uuid, date, date) from anon, authenticated;
revoke execute on function public.get_pnl_by_period(uuid, text, date) from anon, authenticated;
revoke execute on function public.is_in_quiet_hours(uuid) from anon, authenticated;

grant execute on function public.get_enabled_notification_channels(uuid) to service_role;
grant execute on function public.get_equity_curve(uuid, numeric) to service_role;
grant execute on function public.get_performance_by_pattern(uuid, date) to service_role;
grant execute on function public.get_performance_metrics(uuid, date, date) to service_role;
grant execute on function public.get_pnl_by_period(uuid, text, date) to service_role;
grant execute on function public.is_in_quiet_hours(uuid) to service_role;

commit;

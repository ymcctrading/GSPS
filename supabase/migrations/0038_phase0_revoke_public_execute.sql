-- Corrects an ineffective grant in
-- 20260822142000_phase0_lock_down_public_security_definer_rpcs.sql (PR #116,
-- applied to production 2026-08-26): that migration ran
-- `revoke execute ... from anon, authenticated`, but every one of these six
-- functions had EXECUTE granted to PUBLIC by default at creation time (the
-- ordinary Postgres default for a function -- none of the migrations that
-- created them ever revoked it). Revoking from two named roles never
-- touches a separate PUBLIC grant: every role, including anon and
-- authenticated, still had EXECUTE through PUBLIC regardless of the
-- targeted revoke. Confirmed via `pg_proc.proacl` after applying that
-- migration: `{=X/postgres,postgres=X/postgres,service_role=X/postgres}` --
-- the leading `=X/postgres` entry is the PUBLIC grant, still present.
--
-- This is the actual fix: revoke from PUBLIC specifically. The historical
-- migration is left as-is (never edit an applied migration), and its
-- `anon, authenticated` revoke is harmless/redundant now, not wrong.
--
-- Rollback: `grant execute on function public.get_enabled_notification_channels(uuid),
-- public.get_equity_curve(uuid, numeric), public.get_performance_by_pattern(uuid, date),
-- public.get_performance_metrics(uuid, date, date), public.get_pnl_by_period(uuid, text, date),
-- public.is_in_quiet_hours(uuid) to public;` -- not that this should ever be
-- needed; it would reopen exactly the exposure this migration closes.

revoke execute on function public.get_enabled_notification_channels(uuid) from public;
revoke execute on function public.get_equity_curve(uuid, numeric) from public;
revoke execute on function public.get_performance_by_pattern(uuid, date) from public;
revoke execute on function public.get_performance_metrics(uuid, date, date) from public;
revoke execute on function public.get_pnl_by_period(uuid, text, date) from public;
revoke execute on function public.is_in_quiet_hours(uuid) from public;

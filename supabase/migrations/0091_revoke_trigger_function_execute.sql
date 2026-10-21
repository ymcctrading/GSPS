-- GSPS — 0091: close the last three SECURITY DEFINER functions anon can call
--
-- Review finding S-10 (2026-10-21). Supabase's Security Advisor lists three
-- SECURITY DEFINER functions in `public` that `anon` (and `authenticated`)
-- can execute:
--
--   * `log_policy_change()` and `log_promotion_policy_change()` are trigger
--     functions. Postgres checks EXECUTE on a trigger function only when the
--     trigger is created, never when it fires, so revoking it changes nothing
--     about the audit triggers. It only takes them off the PostgREST surface.
--   * `referral_stats()` is called by signed-in members (`app/api/referral`)
--     and filters on `auth.uid()`, so an anonymous call returns zeros. It
--     keeps its `authenticated` grant (0035); only `anon` and `public` lose it.
--
-- Forward-only: no earlier migration is edited. Not applied to production by
-- the session that wrote it.

revoke execute on function public.log_policy_change() from public, anon, authenticated;
revoke execute on function public.log_promotion_policy_change() from public, anon, authenticated;
revoke execute on function public.referral_stats() from public, anon;

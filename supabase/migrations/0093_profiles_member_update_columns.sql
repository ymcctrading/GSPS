-- GSPS — 0093: members may update only their own username and display name
--
-- Review finding R-028 (2026-10-21). 0001's "own profile update" policy lets a
-- member update their own `profiles` row, and `authenticated` holds UPDATE on
-- every column, `tier` included. With the publishable key and their own
-- session a member could set their own tier to SYSTEM_MASTERY (Wall Street),
-- skipping billing and every promotion path and unlocking the autonomous
-- portfolio manager, or rewrite `is_demo` and the Stripe ids. Verified in
-- production: no trigger guards the row.
--
-- The tier is written only by the server (the Stripe webhook and
-- `lib/promotion/promote.ts`, both on the service role). The browser writes
-- `username` (sign-up and Settings), so it keeps its grant, with
-- `display_name`. The auth callback now writes `referred_by` on the service
-- role, once, while it is empty, so a member can't point it at another
-- account later and inflate that account's referral count. The policy is
-- unchanged; the column grant narrows what it can touch. The same goes for INSERT: the signup trigger creates the row.
--
-- Forward-only: 0001 is not edited. Not applied to production by the
-- session that wrote it.

revoke insert, update on table public.profiles from anon, authenticated;
grant update (username, display_name) on table public.profiles to authenticated;

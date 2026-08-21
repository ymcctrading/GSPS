-- 0020 granted execute on resolve_username_email to anon and authenticated so
-- a not-yet-signed-in user could resolve a username to the email their
-- password sign-in needs — Supabase Auth itself only accepts email/phone.
-- That grant also makes it a public, unauthenticated oracle: Supabase exposes
-- every function in the public schema as a PostgREST RPC
-- (/rest/v1/rpc/resolve_username_email), discoverable in the project's own
-- OpenAPI schema, with no rate limit and no app-level generic-error wrapping
-- in front of it. Anyone who can reach that URL gets a real user's email
-- address back for any username they try, at whatever rate Postgres will
-- take requests — a user-enumeration / email-disclosure primitive with no
-- friction at all, caught by the same get_advisors pass 0025 fixed six
-- sibling functions from.
--
-- Unlike those six, this function can't be fixed with an auth.uid() check —
-- its entire purpose is answering a caller who isn't authenticated yet. The
-- fix is to stop it being reachable directly: revoke anon/authenticated
-- execute so only the service role can call it, and move the lookup behind
-- app/api/auth/resolve-username, a same-origin route that returns a
-- uniformly-shaped response for "not found" and "malformed username" alike.
-- That closes the standalone-script attack (curl a documented public RPC
-- with a wordlist) without touching the login UX. It does not by itself add
-- rate limiting to the new route — the app-level surface is smaller and
-- harder to discover than a schema-documented RPC, but a motivated caller
-- who finds it can still probe it at whatever rate the route allows. Real
-- rate limiting is follow-up work, not part of this migration.

revoke execute on function public.resolve_username_email (text) from public, anon, authenticated;
grant execute on function public.resolve_username_email (text) to service_role;

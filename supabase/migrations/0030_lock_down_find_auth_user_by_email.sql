-- find_auth_user_by_email (0029) is SECURITY DEFINER with no auth.uid()
-- check, granted to anon and authenticated — the same shape of bug 0028
-- fixed for resolve_username_email, caught the same way (get_advisors,
-- "Public Can Execute SECURITY DEFINER Function"). It returns whether an
-- email is registered, whether it's confirmed, and the account's internal
-- auth.users id, to any caller, for any email they try — an unauthenticated
-- account-enumeration oracle with no rate limit.
--
-- Unlike resolve_username_email, nothing in this repo calls it yet — no
-- route, no client code, grep turns up nothing. That makes this the easy
-- case: revoking the public grant costs no live feature anything today.
-- Whatever this was built for should reach it through a server route on a
-- service-role client instead, the same pattern app/api/auth/resolve-
-- username now uses, at which point it doesn't need anon/authenticated
-- execute regardless.

revoke execute on function public.find_auth_user_by_email (text) from public, anon, authenticated;
grant execute on function public.find_auth_user_by_email (text) to service_role;

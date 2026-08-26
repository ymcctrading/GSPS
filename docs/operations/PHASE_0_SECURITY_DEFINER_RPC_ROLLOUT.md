# Phase 0 SECURITY DEFINER RPC Rollout

## Purpose

This forward-only migration removes `anon` and `authenticated` execution rights from six public `SECURITY DEFINER` helper functions. Trusted server-side workloads may continue to invoke them through the Supabase `service_role`.

## Production topology

- GitHub repository: `ymcctrading/GSPS`
- Vercel project: `gsps` in the Gann Protocol team
- Production Supabase project: `vebhpmmzxixlhujlptue`

Do not redirect production configuration to `vlbsrhxghghfkjbttqha`; that project is not the production database.

## Scope

The migration restricts these public functions:

- `get_enabled_notification_channels(uuid)`
- `get_equity_curve(uuid, numeric)`
- `get_performance_by_pattern(uuid, date)`
- `get_performance_metrics(uuid, date, date)`
- `get_pnl_by_period(uuid, text, date)`
- `is_in_quiet_hours(uuid)`

### Excluded: `referral_stats()`

Audited and deliberately left callable by `authenticated`. It takes no
caller-supplied `user_id` — it scopes itself internally via `auth.uid()`
(`0035_referrals.sql`) — so unlike the other six there is no cross-user read
for a public grant to expose. `app/api/referral/route.ts` calls it through
the user-session client, not `service_role`, by design. Revoking its
`authenticated` grant would silently zero out every user's referral stats
(the route does not check the RPC error before calling `.single()`) with no
corresponding security benefit.

## Preconditions

Before applying the migration to production:

1. Verify the Supabase project reference is `vebhpmmzxixlhujlptue`.
2. Search the deployed web client for direct browser-side RPC calls to each function.
3. Verify required server-side callers use a trusted `service_role` path and do not expose that credential to a browser.
4. Record the Security Advisor baseline and current function privileges.
5. Confirm the change has passed PR review and has separate authorization for production migration execution.

## Validation

After an authorized production application:

1. Re-run Supabase Security Advisor and confirm the public execute exposure is removed.
2. Exercise analytics, notification preferences, and quiet-hours behavior through their intended `service_role` server-side paths; confirm referral reporting (still on the authenticated path) is unaffected.
3. Review Vercel runtime logs for RPC permission failures.
4. Record the migration version, deployment identifier, validation evidence, and reviewer in the release log.

## Rollback

Use a forward migration that grants only the least privilege demonstrated as required by a verified caller. Do not restore `anon` access as a shortcut. If a browser-side dependency is discovered, replace it with an authenticated server endpoint or a narrowly scoped invoker function before granting access.

## Remaining manual task

Supabase leaked-password protection remains a dashboard-side control. Enable it in the production project after confirming the organization policy and document the completion in the release log.

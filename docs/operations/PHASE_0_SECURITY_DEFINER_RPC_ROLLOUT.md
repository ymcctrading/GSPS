# Phase 0 SECURITY DEFINER RPC Rollout

## Purpose

This forward-only migration removes `anon` and `authenticated` execution rights from seven public `SECURITY DEFINER` helper functions. Trusted server-side workloads may continue to invoke them through the Supabase `service_role`.

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
- `referral_stats()`

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
2. Exercise analytics, notification preferences, quiet-hours behavior, and referral reporting through their intended authenticated server-side paths.
3. Review Vercel runtime logs for RPC permission failures.
4. Record the migration version, deployment identifier, validation evidence, and reviewer in the release log.

## Rollback

Use a forward migration that grants only the least privilege demonstrated as required by a verified caller. Do not restore `anon` access as a shortcut. If a browser-side dependency is discovered, replace it with an authenticated server endpoint or a narrowly scoped invoker function before granting access.

## Remaining manual task

Supabase leaked-password protection remains a dashboard-side control. Enable it in the production project after confirming the organization policy and document the completion in the release log.

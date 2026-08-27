# GSPS — Claude Code Implementation Handoff

Baseline audit summary, completed work, remaining work, and implementation contract.

_Converted from the uploaded PDF of the same name; source of truth for wording is that PDF if this ever drifts._

## Purpose

This is a machine-oriented handoff for Claude Code. The user-provided Phase 0, Phase 1, Phase 3, security, scheduling, testing, and release requirements are authoritative. Do not merge, deploy, change production configuration, apply production migrations, enable production schedules, or activate billing without separate explicit confirmation immediately before that action.

## Repository and production identifiers

| System | Identifier / State |
|---|---|
| GitHub repository | `ymcctrading/GSPS` |
| Default branch | `main` @ `df5c45b7119d082ac48f05f13561fc0c72d5526d` |
| Supabase production | `vebhpmmzxixlhujlptue` (ACTIVE_HEALTHY, PostgreSQL 17) |
| Vercel production project | `gsps`, Gann Protocol team |
| Non-production reference | Do not redirect production to `vlbsrhxghghfkjbttqha` |
| Do not recreate | Historical migration 0003 is intentionally absent |

## Mandatory files already identified

- Read `AGENTS.md`, `supabase/AGENTS.md`, `app/api/AGENTS.md`, `package.json`, `vercel.json`, `ROADMAP.md`, `IMPLEMENTATION.md`, `SECURITY.md`, `docs/DEPLOYMENT_SOP.md`, `docs/RUNBOOK.md`, `docs/TESTING.md`, and relevant repository/Google Drive PDRs, audits, and architecture documents.
- Relevant existing routes include `app/api/scan`, `app/api/guided`, `app/api/intraday-scan`, `app/api/backtest`, `app/api/notifications`, and `app/api/market-scan`.
- Repository migrations run from 0001 through 0035, excluding intentional gap 0003. Never edit, overwrite, renumber, or recreate historical migrations.

## What has been accomplished

### Baseline audit

- Connected-system discovery completed for GitHub, Supabase, Vercel, Google Drive, and Finance.
- Repository root, migration inventory, API routes, open PR state, and production Supabase metadata were inspected read-only.
- No repository file, branch, PR, database object, secret, Vercel setting, schedule, deployment, or production data was changed.
- Production public tables were enumerated. All 30 listed public tables report RLS enabled.
- A daily-scan Supabase Edge Function is active and has JWT verification enabled.

### Phase 0 — SECURITY DEFINER RPC lockdown

- Draft PR #116: https://github.com/ymcctrading/GSPS/pull/116. Branch `phase0/security-definer-rpc-lockdown` @ `1a78f35ab533456aff10c0261b646088f5df23f2`.
- Adds `docs/operations/PHASE_0_SECURITY_DEFINER_RPC_ROLLOUT.md` and `supabase/migrations/20260822142000_phase0_lock_down_public_security_definer_rpcs.sql`.
- Migration revokes `EXECUTE` from `anon`/`authenticated` and grants `EXECUTE` only to `service_role` for seven public `SECURITY DEFINER` functions.
- PR is draft; no recorded review approvals. Unit tests, dependency review, secret scan, npm audit, and branch/roadmap checks passed. Supabase Preview was skipped.
- Security Advisor baseline confirms all seven target functions remain executable by `anon` and `authenticated` in production.

### Phase 1 — Tier entitlement specification

- Draft PR #117: https://github.com/ymcctrading/GSPS/pull/117. Branch `phase1/tier-entitlement-spec` @ `f3ed35907047f3f4e91c4e8da42268849295d9ce`.
- Adds `docs/GSPS_TIER_ENTITLEMENT_SPEC.md`.
- Spec includes tiers, ET quotas, result caps 6/12/20/30, Novice 3 Buy/3 Sell directional backfill, monitoring lifecycle, idempotency, HTTP semantics, additive migrations, and no-Stripe scope.
- Unit, dependency review, secret scan, and npm audit passed. Roadmap phase named failed. Supabase Preview was skipped. PR is draft and must not be merged.

## Unresolved blockers

### Phase 0 security blockers

- Security Advisor reports fourteen warnings: seven `SECURITY DEFINER` functions are callable by both `anon` and `authenticated` roles.
- Supabase Auth leaked-password protection is disabled. This is a dashboard-side production configuration decision and requires explicit confirmation before change.
- Before release, audit every target function definition, explicit safe `search_path`, grants, ownership, authorization, and all callers.
- Search for direct browser RPC calls to all seven functions. Replace required browser use with authenticated server endpoints or secure invoker behavior.
- Do not merge/apply Phase 0 without review, validation, release documentation, and explicit confirmation.

### Migration drift blockers

- Production migration history is timestamp-based and does not map one-to-one to repository numeric migration filenames.
- Production-only or non-obvious records requiring reconciliation include `harden_handle_new_user_execute`, `gsps_tiers_and_automation_profiles`, `gsps_revenue_ledger_and_scan_runs`, `gsps_harden_revenue_trigger_fn`, `gsps_schedule_daily_scan`, `gsps_public_read_scan_tables`, `restore_resolve_username_email_grants`, and `reapply_resolve_username_email_lockdown`.
- Production records `retire_mock_daily_scan_cron` twice under different versions. Document why before relying on automatic migration replay.
- Supabase `list_branches` reports only `main` and status `MIGRATIONS_FAILED` while production project is `ACTIVE_HEALTHY`. Investigate before creating/trusting a development preview branch.
- No new production migration until a written production-to-repository reconciliation map and forward-only migration plan exist.

### Phase 1 blockers

- Determine why Roadmap phase named failed on PR #117.
- Update only required metadata or documentation, rerun checks, then request review. Keep draft until review completion.

## Phase 3 — implementation contract

### Scope

Implement secure server-side entitlements without Stripe or billing. Client-provided plan, user identity, visible-result identity, quota, monitor state, notification state, and eligibility are never authoritative. Check authorization before expensive provider/AI work. Fail closed if authoritative entitlement, quota reservation, upstream dependency, or freshness cannot be verified.

### Required server policy

- Create one central server-only entitlement policy resolver. Resolve profile tier from authoritative backend records only.
- Tiers: Novice, Pro, Expert, Wall Street. Manual dashboard scan/day: 1, 3, 6, unlimited/fair use. Guided scan/day: 1, 2, 6, unlimited/fair use.
- Automation = Pro+. Intraday = Expert+. Backtesting = Wall Street only.
- Cap visible setups before user-visible persistence or response: Novice 6; Pro 12; Expert 20; Wall Street 30.
- Novice: select up to 3 Buy and 3 Sell by rank, then fill unused slots with highest-ranked valid results from either direction. Never fabricate padding.
- Use America/New_York daily boundaries. Scheduled 6:00 AM and 9:15 AM scans never debit user `manual_dashboard_scan` or `guided_scan` quota.

### Required database additions

- Use additive migrations only. Add usage/quota ledger, scan-execution metadata, user-visible result records, active monitor registry, monitor transition ledger, and notification delivery ledger.
- Add strong constraints, indexes, RLS, and narrowly granted server-only mutation functions.
- Atomic reservations must tolerate concurrency and be finalized, released, or safely failed when no valid result exists.
- RLS must block client mutation of entitlement, usage, monitor, transition, and delivery data.
- Generate TypeScript database types and commit them only when the repository convention requires it.

### Monitor state machine

- Server-derived states: WATCH, EXECUTE, INVALIDATED, NO_SETUP, EXPIRED.
- Only visible entitled results can be monitored. Persist every transition.
- Notify only on confirmed WATCH -> EXECUTE. Delivery must be idempotent.
- Do not re-alert EXECUTE unless setup leaves EXECUTE, returns to WATCH, and reconfirms EXECUTE.
- Use configurable cooldown and prevent stale Execute alerts following a newer invalidation.

### HTTP semantics

| Status | Meaning |
|---:|---|
| 401 | unauthenticated |
| 403 | feature excluded by plan |
| 409 | duplicate / idempotency conflict |
| 429 | quota, rate, concurrency, or fair-use exhaustion |
| 503 | unavailable required upstream; fail closed |

## Implementation sequence for Claude Code

0. **READ-ONLY PRECHECKS** — Read mandatory instructions and relevant docs. Use only actual `package.json` scripts. Inspect `main`, PR #116, PR #117, CI, Vercel, Supabase migrations/RLS/functions/advisors. Record an implementation and release plan in active PR or release documentation.
1. **RECONCILE MIGRATIONS** — Map every production migration version/name to repository migration or documented out-of-band change. Identify production-only history, unapplied repository history, duplicate records, and preview replay failures. Do not fix drift by editing historic files. Before a billable Supabase branch: get actual cost, disclose it, and obtain confirmation.
2. **FINISH PHASE 0** — Search source for the seven function names and confirm no direct browser RPC dependency remains. Audit definitions, owner, `search_path`, grants, and all callers. Make only forward-safe PR #116 changes needed by evidence. Validate non-production when available; rerun Security Advisor. Document accepted exceptions. Do not merge/apply production migration without explicit confirmation.
3. **FINISH PHASE 1** — Diagnose/fix Roadmap phase named failure on PR #117. Confirm entitlement specification exactly meets authoritative requirements. Run checks and request review. Do not merge without explicit confirmation.
4. **IMPLEMENT PHASE 3 AS SMALL REVIEWABLE PRS**
   - A. Server policy types/resolver + tests.
   - B. Additive migration, RLS, server-only mutation RPCs, generated types if required.
   - C. Manual/guided quotas, result caps, hidden-result non-leakage.
   - D. Trusted 6:00/9:15 ET jobs, market calendar, preview no-op guardrails.
   - E. Monitor lifecycle, transitions, cooldown/re-arm, invalidation precedence, delivery idempotency.
   - F. Automation/intraday/backtest gates.
   - G. Full test, preview verification, release documentation.
5. **RELEASE GATES** — PR review and checks passing; Phase 0 resolved/accepted; migration drift documented; development validation when available/approved; preview reviewed; preview smoke tests pass; rollback documented; explicit action-specific confirmation before irreversible production changes.

## Required test matrix

- Authentication/authorization for protected routes/jobs and all plan boundaries.
- Manual/guided quota isolation, ET reset including DST behavior, scheduled non-consumption, concurrent atomic attempts, and idempotency collisions.
- Result caps, Novice directional backfill, and no hidden-result leakage in response/history/monitoring/notifications/exports.
- Feature gates for automation/intraday/backtests, monitor capacity/eligibility, lifecycle idempotency, cooldown/re-arm, invalidation precedence, and notification-delivery idempotency.
- RLS tests blocking protected client mutation; migration safety/recovery; preview and post-authorized-production smoke tests.

## Scheduling constraints

- Inspect actual Vercel plan and cron capability before implementation.
- Use existing trusted-job authentication. Do not expose secrets.
- Use a market calendar and skip holidays unless documented approved exception applies.
- Preview must not trigger real schedules, external mass notifications, or cost-amplifying scans.
- Do not enable production cron until all release gates pass and explicit confirmation is received.

## Definition of done

- Phase 0 exposure remediated or explicitly accepted with Security Advisor evidence.
- Phase 1 passes checks and review.
- Phase 3 is server-authoritative, atomic, RLS-protected, tested, and cannot leak hidden results.
- Migration drift is documented/accounted for; preview passes safety checks; rollback/recovery is documented.
- PR/release docs include changed files, migration/RLS summary, enforcement map, exact commands/results, rollback, risks, and remaining actions.

## Actions that always require explicit confirmation

- Merge any PR into main
- Apply any production Supabase migration
- Deploy to Vercel production
- Change production secrets, env vars, domains, protection, or project settings
- Enable or modify production cron schedules
- Send production notifications or emails
- Enable Stripe, payment collection, billing webhooks, Checkout, Billing Portal, products, prices, or payment processing
- Delete production data, deployments, branches, tables, functions, projects, or secrets

# Phase 3 Entitlement System — Release Documentation

Consolidated record for the Phase 3A–3G work on `claude/perplexity-audit-phases-53la8l`
(PR #118), against the contract in `GSPS_CLAUDE_CODE_IMPLEMENTATION_HANDOFF.md`
and `docs/GSPS_TIER_ENTITLEMENT_SPEC.md`. Written at the end of Phase 3G per that
handoff's "G. Full test, preview verification, release documentation" step.

**Update (2026-08-26, post-3G):** migrations `0036` and `0037` have since
been applied directly to production (`vebhpmmzxixlhujlptue`) per explicit
direct instruction — see "Known risks" and "Remaining actions" below for
what that means and what's still open. Nothing else described here
(route/library code, PR #116/#117 merges) had happened as of this writing.

## What shipped, by phase

| Phase | What it added |
|---|---|
| 3A | `lib/entitlements/policy.ts` — the entitlement policy resolver (quotas, caps, gates, capacities) for all four tiers, built on the existing `PlatformTier` enum (Option A tier mapping). |
| 3B | `supabase/migrations/0036_entitlement_usage_and_monitors.sql` — six additive tables (usage ledger, scan executions, visible scan results, active monitors, monitor transitions, notification deliveries), RLS, and the `reserve_usage_slot`/`finalize_usage_reservation` RPCs. |
| 3C | `lib/entitlements/quota.ts`, `lib/entitlements/result-selection.ts` — wired into `/api/batch-scan` (added auth, quota metering, result-visibility cap) and `/api/guided` (added quota metering only). |
| 3D | `lib/market/calendar.ts` (computed NYSE holiday calendar), `lib/entitlements/scheduled-scan.ts`, `/api/scans/morning-preparation`, `/api/scans/morning-confirmation` — the trusted 6:00/9:15 ET job scaffolding. |
| 3E | `lib/entitlements/monitor.ts` (pure state machine), `lib/entitlements/monitor-store.ts` (DB-backed), `lib/entitlements/delivery.ts` — Watch→Execute lifecycle, cooldown/re-arm, invalidation, idempotent delivery recording, wired into `/api/batch-scan`. |
| — | Scheduling fix: `.github/workflows/morning-preparation-scan.yml` / `morning-confirmation-scan.yml` (GitHub Actions, since both Vercel cron slots are spent) at a reduced scan budget pending a higher-tier data plan. |
| 3F | `/api/backtest` gated on `backtestingEnabled`; `/api/intraday-scan` gated on `intradayScansEnabled`; `automationEnabled` corrected to Wall-Street-only to match the already-shipped `/automation` gate (confirmed, not widened). |
| 3G | This document, plus a full repo-wide verification pass (below). |
| — | `supabase/migrations/0037_grant_all_profiles_wall_street.sql` — grants every existing profile Wall Street tier for free, per direct product decision (2026-08-26). Out-of-sequence relative to 3A–3F but included here since it touches the same `profiles.tier` column and entitlement system. |

## File-by-file summary

See `git diff origin/main...claude/perplexity-audit-phases-53la8l --stat` for
the exact diff. In prose:

**New library code** (`lib/entitlements/`): `policy.ts`, `quota.ts`,
`result-selection.ts`, `scheduled-scan.ts`, `monitor.ts`, `monitor-store.ts`,
`delivery.ts`, plus a `__tests__/` file for each (7 test files, 65 new
tests total). **New library code** (`lib/market/`): `calendar.ts` +
`__tests__/calendar.test.ts` (7 tests).

**Routes changed**: `app/api/batch-scan/route.ts` (auth added; quota,
result-cap, monitor, and delivery wiring added — previously had none of
this), `app/api/guided/route.ts` (quota wiring added around the existing
recommendation flow), `app/api/backtest/route.ts` (tier gate added),
`app/api/intraday-scan/route.ts` (tier gate added to the user-initiated
path only).

**Routes added**: `app/api/scans/morning-preparation/route.ts`,
`app/api/scans/morning-confirmation/route.ts`.

**Workflows added**: `.github/workflows/morning-preparation-scan.yml`,
`morning-confirmation-scan.yml`.

**Docs added at repo root** (mirroring the session's source PDFs so a future
session has them without hunting them down again):
`GSPS_CLAUDE_CODE_IMPLEMENTATION_HANDOFF.md`,
`GSPS_PHASE1_CLAUDE_CODE_IMPLEMENTATION_INSTRUCTIONS.md`,
`GSPS_DOCTRINE_ALIGNMENT_AUDIT.md`. **Docs updated**:
`docs/THIRD_PARTY_LIMITS.md` (new scheduled jobs + upgrade path).
(The root-level mirrors of `docs/GSPS_TIER_ENTITLEMENT_SPEC.md` and
`docs/operations/PHASE_0_SECURITY_DEFINER_RPC_ROLLOUT.md` that existed
earlier in this branch's history were removed once PR #116/#117 — which
carry the canonical copies — were confirmed to still be merging, to avoid
landing two copies of the same doc on `main`.)

**Migrations added**: `0036_entitlement_usage_and_monitors.sql`,
`0037_grant_all_profiles_wall_street.sql`.

## Migration / RLS summary

### `0036_entitlement_usage_and_monitors.sql`

| Table | RLS | Client access |
|---|---|---|
| `usage_ledger` | Enabled | Select own rows only. No client insert/update/delete — only `service_role` or the two RPCs below. |
| `scan_executions` | Enabled | Select own rows only (system rows have `profile_id = null` and are not selectable by any user). |
| `visible_scan_results` | Enabled | Select own rows only. |
| `active_monitors` | Enabled | Select own rows only. Partial unique index enforces at most one open (`WATCH`/`EXECUTE`) monitor per `profile_id`+`symbol`. |
| `monitor_transitions` | Enabled | Select own rows only. Unique on `transition_key` (idempotency boundary). |
| `notification_deliveries` | Enabled | Select own rows only. Unique on `idempotency_key`. |

RPCs: `reserve_usage_slot` and `finalize_usage_reservation`, both
`SECURITY INVOKER`, both with `EXECUTE` explicitly revoked from
`anon`/`authenticated` and granted only to `service_role` — applying the
same lesson this session's Phase 0 audit found missing on
`referral_stats()` (see PR #116's rollout doc,
`docs/operations/PHASE_0_SECURITY_DEFINER_RPC_ROLLOUT.md`) from the
start rather than retrofitting it.

### `0037_grant_all_profiles_wall_street.sql`

One unconditional `update public.profiles set tier = 'SYSTEM_MASTERY'` —
no schema change, no RLS change. Does not touch the `tier` column's
default, so it affects every profile that exists at the moment it's
applied, not future signups.

## Enforcement map

| Route / job | Gate | Policy field |
|---|---|---|
| `GET /api/batch-scan` | Auth (401) → quota (429) → result cap | `manualDashboardScansPerDay`, `maxDashboardSetupsPerScan` |
| `GET /api/guided` | Auth (401, pre-existing) → quota (blocked reason) | `guidedScansPerDay` |
| `GET /api/backtest` | Auth (401, pre-existing) → feature (403) | `backtestingEnabled` |
| `GET /api/intraday-scan` (user path) | Auth (401, pre-existing) → feature (403) | `intradayScansEnabled` |
| `/automation` page | Feature gate (pre-existing, unchanged) | `lib/tiers.ts`'s `autonomous_portfolio_manager`, mirrored (not re-implemented) by `policy.automationEnabled` |
| `/api/scans/morning-preparation`, `/api/scans/morning-confirmation` | `CRON_SECRET` bearer → preview no-op → trading-day no-op | N/A (system jobs, no per-user quota) |

Monitor lifecycle (`evaluateMonitor`) is wired only into `/api/batch-scan`,
for the visible (capped) result set — never for hidden/rejected/errored
results. Guided scans are deliberately not wired to monitors (see
`app/api/guided/route.ts`'s header comment and the "Deferred / deliberately
excluded" section below).

## Verification — commands and results (this session, final pass)

All run from repo root on `claude/perplexity-audit-phases-53la8l`:

```
$ npm run check:migrations
✓ 36 migrations, all prefixes unique

$ npx tsc --noEmit
(clean, no output)

$ npm run lint
✖ 18 problems (0 errors, 18 warnings)
```
All 18 warnings are either pre-existing (unrelated files, confirmed present
before this branch's changes) or intentionally-unused mock parameters in
this branch's own test files (`lib/entitlements/__tests__/delivery.test.ts`).
Zero errors.

```
$ npm test
 Test Files  79 passed (79)
      Tests  964 passed (964)
```
196 of those tests are new to this branch (across `lib/entitlements/__tests__/`
and `lib/market/__tests__/calendar.test.ts`); the rest are the pre-existing
suite, unchanged and still passing.

```
$ npm run build
(exit 0; all routes including the 4 new ones compile)
```

No Playwright/e2e run in this session (no separate non-production Supabase
project was available to exercise these migrations against before they
were applied directly to production — see "Known risks" below; same
limitation noted in PR #85's own verification section for its own
end-to-end coverage). Manual preview verification against a live Vercel
preview deployment of PR #118 still hasn't happened.

## Rollback

- **0036**: `drop table if exists public.notification_deliveries, public.monitor_transitions, public.active_monitors, public.visible_scan_results, public.scan_executions, public.usage_ledger cascade; drop type if exists public.monitor_state; drop function if exists public.reserve_usage_slot(uuid, text, date, uuid, int); drop function if exists public.finalize_usage_reservation(uuid, uuid, text);` (also given inline in the migration's own header comment).
- **0037**: No automatic rollback — it does not record prior per-profile tiers. Reversal requires either a pre-migration backup restore or a forward migration resetting `tier` to `'PRACTICE'` for every row (losing whatever individual tier history existed before).
- **Route/library changes**: ordinary code revert (`git revert`); nothing here is a one-way data change.

## Deferred / deliberately excluded (not gaps to silently fill later)

- **Guided scans are not wired to monitors.** `docs/GSPS_TIER_ENTITLEMENT_SPEC.md`'s eligible-monitor-source list excludes them, and Guided Mode's own single-use shown/dismissed/executed/expired lifecycle would conflict with a lingering Watch/Execute monitor. Evaluated explicitly this session (2026-08-26); see `app/api/guided/route.ts`'s header comment.
- **Scheduled-scan (6:00/9:15 ET) output does not fan out into per-user monitors or visible results.** Those jobs have no per-profile entitlement context (`profile_id = null`) — deciding which profiles are "entitled" to a system-wide scan's output is a separate design question this phase didn't answer.
- **No automatic time-based `EXPIRED` sweep.** The state exists in the type system; nothing currently transitions a monitor into it based on elapsed time.
- **No actual notification dispatch.** `notification_deliveries` rows are recorded idempotently at `status: 'pending'`; sending the email/SMS/push itself is separate, pre-existing infrastructure (`lib/notifications`) that a future PR would wire to those rows.
- **No freshness/staleness validation** in the scan pipeline — no staleness signal exists elsewhere in the codebase to check against yet.
- **Reduced scan budget** on the two new scheduled jobs (`MORNING_SCAN_UNIVERSE_TOP`/`MORNING_SCAN_PER_SIDE` in `lib/entitlements/scheduled-scan.ts`) pending a higher-tier data-provider plan — see `docs/THIRD_PARTY_LIMITS.md`'s "Upgrading past current limits."

## Known risks

- **Migration drift** (flagged in the original audit, not independently re-verified beyond the targeted checks below): production's applied-migration history was reported as timestamp-based and not cleanly mapped to this repo's numbered files, with `list_branches` showing `MIGRATIONS_FAILED` against an `ACTIVE_HEALTHY` project. Before applying 0036/0037, `list_migrations` was checked directly and confirmed production's history runs cleanly through the equivalent of 0035 (`referrals`), and the specific column/type/table dependencies both new migrations need (`platform_tier`'s `SYSTEM_MASTERY` value, `profiles.tier`, `notification_channel`/`notification_status`) were confirmed present beforehand — the broader reconciliation the original audit called for was not redone in full.
- **0036/0037 are now applied to production**, per direct instruction (2026-08-26). Post-apply verification: all 6 new tables present with RLS enabled, both new RPCs present, all 15 existing profiles confirmed at `SYSTEM_MASTERY`, and the security advisor shows the same 14 pre-existing warnings as the pre-apply baseline (i.e., 0036 introduced zero new exposure).
- **0037's blast radius**: it changed every existing user's billing tier to the top paid tier for free, immediately. This bypasses whatever revenue the `platform_tier`/Stripe system was otherwise metering for current users. Confirmed as an intentional, direct decision (2026-08-26) — flagged here so it's a documented decision, not a quiet side effect discovered later.
- **Phase 0 (PR #116) is a separate prerequisite** for the six locked-down RPCs; this phase's new RPCs (`reserve_usage_slot`, `finalize_usage_reservation`) already shipped service-role-only from the start, so they don't carry the same exposure Phase 0 is fixing retroactively — but Phase 0's own migration (the RPC lockdown) is still unapplied to production as of this writing.
- **No non-production environment was available this session** to exercise either migration end-to-end before applying it to production (same limitation the original audit and PR #85 both hit) — the checks above are schema/advisor-level, not a live application smoke test against the new routes.

## Remaining actions requiring explicit confirmation

Per the standing rule (and `GSPS_CLAUDE_CODE_IMPLEMENTATION_HANDOFF.md`'s own list):

- ~~Apply `0036_entitlement_usage_and_monitors.sql` to production.~~ Done (2026-08-26).
- ~~Apply `0037_grant_all_profiles_wall_street.sql` to production.~~ Done (2026-08-26).
- Apply Phase 0's RPC lockdown migration (PR #116, separate branch) to production — still open.
- Merge PR #118, #117, and #116 into `main` (which, on this repo, is itself a production deploy) — in progress per direct instruction (2026-08-26); see each PR for final status.
- Enable the two new GitHub Actions schedules in practice — they start firing automatically once this branch (or its workflow files) reach `main`, since GitHub Actions schedules run off the default branch regardless of which branch introduced them. Flagged again here since it's easy to lose track of amid everything else in this document.

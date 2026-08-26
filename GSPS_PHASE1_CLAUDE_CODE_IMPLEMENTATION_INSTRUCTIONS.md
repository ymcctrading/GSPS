# GSPS Phase 1: Claude Code Implementation Instructions

Entitlement Foundation, Scan Metering, Result Visibility, and Watch → Execute Notifications.

_Converted from the uploaded PDF of the same name; source of truth for wording is that PDF if this ever drifts._

**Status:** Implementation-ready instruction set. This document is for Claude Code to use after a human authorizes a feature branch and PR. It does not authorize a merge, deployment, Supabase migration application, Stripe setup, secret configuration, or production change.

## 1. Objective

Implement the Phase 1 entitlement foundation for GSPS without implementing Stripe. The system must enforce the approved Novice, Pro, Expert, and Wall Street product rules on the server; meter user-initiated work; restrict visible dashboard setups; and create reliable Watch → Execute monitoring and notification state.

### Do not implement payments in this PR

- Do not add Stripe packages, Checkout, Billing Portal, webhooks, Price IDs, secrets, Vercel environment variables, or production billing configuration.
- Do not merge any PR, deploy, apply a migration to production, change Supabase plans, or modify production settings.
- Use additive migrations only. Never rewrite or renumber existing migrations; migration 0003 is intentionally absent.
- Keep existing behavior intact for current users until a tested entitlement rollout decision is separately approved.

## 2. Product Rules

| Capability | Novice | Pro | Expert | Wall Street |
|---|---:|---:|---:|---:|
| 6:00 AM ET scheduled Morning Preparation | Included | Included | Included | Included |
| 9:15 AM ET confirmation scan | Included | Included | Included | Included |
| Manual dashboard scans/day | 1 | 3 | 6 | Unlimited (fair use) |
| Guided scans/day | 1 | 2 | 6 | Unlimited (fair use) |
| Visible Buy/Sell setups per dashboard scan | 6 | 12 | 20 | 30 |
| Automation | No | Yes | Yes | Yes |
| Intraday scans/movement | No | No | Yes | Yes |
| Backtesting | No | No | No | Yes |
| Universe/manual ticker scans | Included; fair use | Included; fair use | Included; fair use | Included; fair use |
| GSPS School | Included | Included | Included | Included |

### Important accounting separation

- The 6:00 AM ET and 9:15 AM ET scheduled scans are system jobs. They do not consume manual dashboard scan quota or guided scan quota.
- A user-clicked dashboard scan consumes only manual dashboard quota.
- A guided scan consumes only guided scan quota.
- A single-ticker manual scan is a detailed plan for one symbol. It is not governed by the multi-symbol dashboard result cap unless implemented as a multi-symbol output.
- All daily quotas reset using America/New_York, not UTC.

## 3. Result Selection Rules

The scanner may generate up to 30 qualifying ranked Buy/Sell setups. Compute the eligible set server-side, remove stale/invalid/expired candidates, then select and persist only the user-visible results. Never send hidden results to the client.

| Plan | Limit | Selection rule |
|---|---:|---|
| Novice | 6 | Prefer up to 3 Buy and 3 Sell. If one direction lacks qualified candidates, fill remaining slots from the highest-ranked candidates in the other direction. Never fabricate signals. |
| Pro | 12 | Return highest-ranked qualified setups; directional diversity is preferred, not mandatory. |
| Expert | 20 | Return highest-ranked qualified setups; directional diversity is preferred, not mandatory. |
| Wall Street | 30 | Return all standard qualifying setups, up to the scanner maximum of 30. |

Return safe metadata with each dashboard response, e.g.:

```json
{
  "qualifyingSetupCount": 27,
  "returnedSetupCount": 6,
  "maxSetupsPerScan": 6,
  "resultLimitApplied": true,
  "directionalAllocation": { "buy": 3, "sell": 3 },
  "upgradeAvailable": true
}
```

## 4. Watch → Execute Behavior

A setup can enter monitoring only if the user was entitled to see it. This includes visible setups from scheduled scans, manual dashboard scans, authorized automation, a manually requested single-ticker scan, or Expert/Wall Street intraday scans.

### Required state machine

```
WATCH -> EXECUTE -> (INVALIDATED | EXPIRED | NO_SETUP)
WATCH -> INVALIDATED | EXPIRED | NO_SETUP
INVALIDATED/EXPIRED/NO_SETUP -> WATCH -> EXECUTE (new valid transition)
```

- Send an alert only for a server-confirmed WATCH → EXECUTE transition.
- Use an idempotency key and a transition ledger so polling, retries, or duplicate jobs cannot send duplicate notifications.
- Do not re-alert until a setup leaves EXECUTE, later returns to WATCH, and reconfirms EXECUTE.
- Apply configurable cooldown protection against flapping states.
- A newer invalidation must prevent a stale Execute notification.

### Required alert payload

- Ticker, asset type, timestamp in ET, scan time frame, and source.
- WATCH → EXECUTE transition and Buy/bullish or Sell/bearish direction.
- Confirmation price, active Gann Root (3/6/9), entry trigger, Take Profit 1, Master Target, and Stop Loss/invalidation vector.
- Deep link to the user-authorized latest GSPS trade plan.

## 5. Architecture Requirements

Centralize policy resolution. Do not scatter raw string comparisons such as `profile.tier === "pro"` across route handlers or client components.

### Create a server-only entitlement module

Suggested location: `lib/entitlements/`. Adapt naming to existing repository conventions after inspection.

```ts
export type PlanId = "novice" | "pro" | "expert" | "wall_street";
export type Limit = number | "unlimited";

export type EntitlementPolicy = {
  morningPreparationScanEnabled: boolean;
  morningConfirmationScanEnabled: boolean;
  manualDashboardScansPerDay: Limit;
  guidedScansPerDay: Limit;
  maxDashboardSetupsPerScan: 6 | 12 | 20 | 30;
  universeScansEnabled: boolean;
  manualTickerScansEnabled: boolean;
  automationEnabled: boolean;
  intradayScansEnabled: boolean;
  backtestingEnabled: boolean;
  maxActiveWatchMonitors: Limit;
  maxAutomationWorkflows: Limit;
  maxCustomAlertRules: Limit;
  maxSavedWatchlists: Limit;
  maxSymbolsPerWatchlist: Limit;
  scanHistoryRetentionDays: Limit;
  processingPriority: "standard" | "elevated" | "high" | "highest";
};
```

### Plan values

| Property | Novice | Pro | Expert | Wall Street |
|---|---:|---:|---:|---:|
| manualDashboardScansPerDay | 1 | 3 | 6 | unlimited |
| guidedScansPerDay | 1 | 2 | 6 | unlimited |
| maxDashboardSetupsPerScan | 6 | 12 | 20 | 30 |
| maxActiveWatchMonitors | 15 | 50 | 150 | unlimited |
| maxAutomationWorkflows | 0 | 5 | 20 | unlimited |
| maxCustomAlertRules | 10 | 50 | 200 | unlimited |
| maxSavedWatchlists | 3 | 10 | 25 | unlimited |
| maxSymbolsPerWatchlist | 25 | 100 | 250 | unlimited |
| scanHistoryRetentionDays | 30 | 90 | 365 | unlimited |
| automation/intraday/backtest | false/false/false | true/false/false | true/true/false | true/true/true |

## 6. Database Work

Use a new additive Supabase migration with the next available filename after the current repository sequence. Before naming it, inspect the branch and main to avoid collisions. Do not apply it to production.

### Required records/tables

| Entity | Minimum fields / constraints | Purpose |
|---|---|---|
| Usage ledger | `profile_id`, `usage_key`, `usage_day_et`, `request_id`, `status`, `reserved_at`, `finalized_at`; unique idempotency/request constraint | Atomic daily quota reservation and auditability |
| Scan execution | `profile_id` nullable for system job, source, started/finished timestamps, policy version, full eligible count, visible count, result freshness | Trace scan execution and plan-aware result selection |
| Visible scan results | `scan_execution_id`, `profile_id`, setup identity, rank, side, visible timestamp | Persist only results the user can see |
| Active monitors | `profile_id`, setup identity, source, state, last evaluated time, expiry, policy version | Track eligible Watch/Execute candidates |
| Monitor transitions | `monitor_id`, prior_state, new_state, transition key unique, occurred_at | Idempotency boundary for state changes |
| Notification deliveries | `transition_id`, channel, idempotency key unique, status, provider ref nullable, timestamps | Prevent duplicate delivery and enable auditing |

### Security requirements

- Enable RLS for new user-owned tables.
- Clients may read only their own authorized visible results, monitors, and delivery history as required by UX.
- Clients must not insert/update tiers, usage rows, monitor states, transitions, or delivery statuses.
- Quota reservation, state transitions, and notification dispatch must occur in trusted server paths using carefully scoped service-role access or secure RPCs, consistent with existing project patterns.
- Use unique constraints and transactional SQL/RPCs to make quota and notification operations idempotent.

## 7. Route and Job Enforcement

Audit the actual GSPS route names before editing. Likely areas include `app/api/scan`, `app/api/batch-scan`, `app/api/guided`, `app/api/intraday-scan`, `app/api/market-scan`, `app/api/backtest`, automation-related routes, notification routes, and the authenticated application layout/settings surface.

### For each protected operation, implement this order

1. Authenticate user (or validate trusted scheduled-job identity).
2. Resolve profile and server-side EntitlementPolicy.
3. Verify feature gate (403 if excluded).
4. Atomically reserve quota/resource slot when applicable (429 if exceeded).
5. Execute provider-backed or computationally expensive work.
6. Validate freshness and eligible setup state.
7. Apply result visibility cap before persistence or response.
8. Create/update eligible monitors and transitions transactionally.
9. Finalize usage/audit record.
10. Release/mark failed reservation when no valid result is created.

Use `401` for unauthenticated requests, `403` for unavailable plan capabilities, `409` for an idempotency conflict, `429` for quotas/rate/concurrency/fair-use limits, and `503` when required upstream functionality is unavailable. Missing dependencies must fail closed and must never grant a paid capability.

## 8. Scheduling

First inspect existing `vercel.json`, cron conventions, scheduled routes, and job-authentication patterns. Do not assume Vercel cron frequency/plan availability. Implement only what current infrastructure supports in a preview-safe manner; otherwise document the exact blocker and leave production scheduling unchanged.

- Schedule/implement the initial Morning Preparation scan for 6:00 AM America/New_York on eligible US market days.
- Schedule/implement a 9:15 AM America/New_York confirmation scan on eligible US market days.
- Respect market holidays. Do not create stock-market scheduled scans for closed regular sessions unless an approved exception policy exists.
- Authenticate scheduled-job requests using the project's established secret/header pattern; never expose a cron secret to the client.
- Scheduled jobs must record source as `scheduled_morning_scan` or `scheduled_morning_confirmation_scan` and must not decrement user manual or guided quotas.

## 9. UI Expectations

- Show plan-appropriate remaining manual dashboard and guided scan counts without treating client state as authoritative.
- Show result-limit metadata and an upgrade message when a scan is truncated by plan cap.
- Do not leak hidden result count details that expose names, tickers, ranks, or trade-plan coordinates for unseen setups.
- Display active monitor/notification status only for user-authorized setups.
- Existing billing settings may show tier status, but do not claim payment functionality or expose unimplemented Checkout/Portal behavior.

## 10. Test Plan

Add or extend unit/integration tests using the repository's existing test stack. Tests should mock provider-heavy scanning behavior and use deterministic time-zone/test-clock controls.

| Area | Required tests |
|---|---|
| Auth | Unauthenticated protected routes return 401 before any expensive work. |
| Manual quotas | Novice: 1; Pro: 3; Expert: 6; Wall Street: no daily product cap. ET reset is correct. |
| Guided quotas | Novice: 1; Pro: 2; Expert: 6; Wall Street unlimited. |
| Scheduled scans | 6:00 and 9:15 runs do not decrement manual or guided quota; holiday behavior is correct. |
| Concurrency | Parallel requests cannot overspend quota; failed reservation is released/finalized safely. |
| Result caps | 6/12/20/30 limits; Novice 3 Buy/3 Sell preference and ranked backfill; no fabricated signals. |
| No leakage | Hidden setups are absent from API payload, persistence, monitor eligibility, notifications, and exports. |
| Feature gates | Automation: Pro+; intraday: Expert+; backtesting: Wall Street only. |
| Monitoring | Only authorized visible sources enter monitors; source/capacity enforcement works. |
| Notifications | One WATCH → EXECUTE notification per valid transition; duplicate/retry/flapping protection; newer invalidation blocks stale alert. |
| RLS/data safety | Client cannot self-upgrade or mutate usage/transition/delivery records. |

## 11. Delivery Sequence for Claude Code

A. Read repository instructions: `AGENTS.md`, `supabase/AGENTS.md`, `app/api/AGENTS.md`, `package.json`, existing migration and notification patterns.
B. Inspect current scan, guided, notification, automation, cron, auth, profile-tier, test, and RLS implementations. Produce a short file-by-file change plan.
C. Create implementation only on an approved feature branch. Do not touch main.
D. Add entitlement policy resolver and unit tests.
E. Add additive migration(s) and RLS/RPC support; do not apply to production.
F. Wire quota reservation, feature gates, and result selection to the actual routes.
G. Add monitor state and idempotent notification infrastructure.
H. Add/update tests and run the repository's relevant test/lint/typecheck commands.
I. Report changed files, migration name, commands run, results, known gaps, and exact preview/production verification steps.
J. Do not merge, deploy, apply migrations, configure secrets, or enable Stripe.

## 12. Definition of Done

- A central, tested entitlement resolver defines all four plans and their approved quotas/capabilities.
- Manual dashboard and guided scans are accurately metered in America/New_York, with atomic protection against concurrent overspend.
- Dashboard output caps are server-enforced at 6/12/20/30 and hidden results never leak.
- Scheduled morning scans are distinctly identified and do not consume user manual/guided quota.
- Watch → Execute monitoring is limited to eligible visible/authorized setups and notification delivery is idempotent.
- Automation, intraday, and backtesting are denied/allowed according to plan gates.
- New tables are additive, RLS-protected, migration-managed, and not applied to production without a separate confirmation.
- Tests cover the tier boundaries, security properties, time-zone reset logic, result visibility, and notification transitions.
- No Stripe implementation, secret configuration, deployment, merge, or production change is performed.

## 13. Required Claude Code Report

At the end of implementation, Claude Code must return a concise report containing:

- Branch and commit/PR identifiers.
- File-by-file summary of changes.
- Migration filename and a plain-English schema/RLS summary.
- Route/job enforcement points added.
- Test, lint, typecheck, and build commands executed with results.
- Any blocked scheduling, infrastructure, or provider constraints.
- Preview verification steps and explicit production-release steps requiring separate authorization.
- Confirmation that no merge, deploy, production migration, secret change, Stripe setup, or production plan change was performed.

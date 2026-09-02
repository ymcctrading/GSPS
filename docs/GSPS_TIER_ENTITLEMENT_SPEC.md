# GSPS Tier Entitlement Specification

**Status:** Phase 1 policy contract

## Purpose

This specification is the server-authoritative product contract for GSPS plans, quotas, setup-result visibility, feature gates, monitoring, and Watch → Execute alerts. It defines intended behavior before implementation. It does not introduce billing, payment activation, Stripe resources, secret values, deployment, or production configuration changes.

## Plan entitlements

| Capability | Novice | Pro | Expert | Wall Street |
|---|---:|---:|---:|---:|
| 6:00 AM ET Morning Preparation scan | Included | Included | Included | Included |
| 9:15 AM ET confirmation scan | Included | Included | Included | Included |
| Manual dashboard scans/day | 1 | 3 | 6 | Unlimited, fair use |
| Guided scans/day | 1 | 2 | 6 | Unlimited, fair use |
| Dashboard setups visible/scan | 6 | 12 | 20 | 30 |
| Universe scans | Included, fair use | Included, fair use | Included, fair use | Included, fair use |
| Manual ticker scans | Included, fair use | Included, fair use | Included, fair use | Included, fair use |
| GSPS School | Included | Included | Included | Included |
| Watch → Execute alerts | Included within capacity | Included within capacity | Included within capacity | Included within fair-use capacity |
| Automation | No | No | No | Yes |
| Intraday scans/movement | No | No | Yes | Yes |
| Backtesting | No | No | No | Yes |

## Operational capacities

| Capacity | Novice | Pro | Expert | Wall Street |
|---|---:|---:|---:|---:|
| Active Watch → Execute monitors | 15 | 50 | 150 | Unlimited, fair use |
| Automation workflows | 0 | 0 | 0 | Unlimited, fair use |
| Custom alert rules | 10 | 50 | 200 | Unlimited, fair use |
| Saved watchlists | 3 | 10 | 25 | Unlimited, fair use |
| Symbols/watchlist | 25 | 100 | 250 | Unlimited, fair use |
| Scan-history retention (days) | 30 | 90 | 365 | Full available history/fair use |

“Unlimited” does not mean unbounded system consumption. No product daily cap is published, but rate, concurrency, cost, queue, provider, and abuse controls remain enforceable.

## Quota semantics

- A daily quota day is bounded by `America/New_York`.
- The 6:00 AM ET Morning Preparation scan and 9:15 AM ET confirmation scan are automated system work. They do not consume a user’s manual-dashboard or guided-scan quota.
- A user-clicked dashboard scan consumes exactly one `manual_dashboard_scan` unit.
- A guided scan consumes exactly one `guided_scan` unit.
- A manual dashboard scan must not consume guided-scan quota, and a guided scan must not consume manual-dashboard quota.
- Authorization, feature validation, and quota reservation occur before expensive provider-backed work.
- Quota/resource reservations must be atomic and finalized, released, or safely marked failed when no valid result is created.

## Setup-result visibility

The scanner may compute and rank up to 30 qualifying setups. The server must enforce the applicable visible-result cap before returning a response or creating user-visible persistence.

| Plan | Maximum visible setups | Selection rule |
|---|---:|---|
| Novice | 6 | Target up to 3 Buy and 3 Sell. When one side lacks valid results, fill unused slots with the highest-ranked valid results from the other side. |
| Pro | 12 | Highest-ranked valid results; prefer directional diversity when available. |
| Expert | 20 | Highest-ranked valid results; prefer directional diversity when available. |
| Wall Street | 30 | Highest-ranked valid results. |

The system must never fabricate or pad results. Hidden or ineligible setups must not be revealed, exported, persisted to user history, monitored, or used to trigger an alert for a user whose plan cannot see them.

## Monitor eligibility and lifecycle

Eligible monitor sources are:

- 6:00 AM Morning Preparation output
- 9:15 AM confirmation output
- Manual dashboard scans
- Plan-authorized automated scans and watchlists
- Manually requested single-ticker scans, subject to monitor capacity
- Expert and Wall Street intraday scans, subject to monitor capacity

Required server-derived states are `WATCH`, `EXECUTE`, `INVALIDATED`, `NO_SETUP`, and `EXPIRED`.

A user may receive a notification on a confirmed `WATCH → EXECUTE` transition, and on a tracked setup breaking (`WATCH`/`EXECUTE` → `INVALIDATED`) — see "Correction (2026-09-02)" below. `NO_SETUP` and `EXPIRED` never notify: neither means the setup broke, only that a later scan didn't reconfirm it. The system must persist monitor state, transitions, idempotency information, and delivery records. It must not re-alert an already executed setup unless the setup first leaves `EXECUTE`, returns to `WATCH`, and then reconfirms `EXECUTE`.

An alert payload must include: ticker, asset type, ET timestamp, source/timeframe, direction, confirmation price, Gann Root (3, 6, or 9), entry, TP1, master target, stop/invalidation, and a deep link to the user-authorized trade plan.

## Required server flow

Every protected route, server action, background job, and notification worker must:

1. Authenticate a user or validate trusted scheduled-job identity.
2. Resolve the server-authoritative plan and entitlement policy.
3. Validate the requested feature.
4. Atomically reserve applicable quota or resource capacity.
5. Run expensive or provider-backed work only after authorization succeeds.
6. Validate result freshness.
7. Apply the entitlement result cap before user-visible persistence or response.
8. Create or update monitors and transitions transactionally.
9. Finalize usage and audit records.
10. Release or safely mark failed reservations when no valid result is created.

## Error semantics

| Status | Meaning |
|---:|---|
| 401 | Not authenticated |
| 403 | Plan does not include the capability |
| 409 | Idempotency conflict or duplicate event |
| 429 | Daily quota, rate, concurrency, or fair-use threshold reached |
| 503 | Required upstream service unavailable; failure must never grant access |

## Security and data authority

- Plan/tier resolution is server authoritative.
- Ordinary clients must not self-upgrade tiers, modify usage records, manipulate monitor transition state, or mark notification delivery success or failure.
- RLS must enforce user isolation and deny client-side mutation of protected entitlement, usage, monitor, transition, and delivery state.
- Entitlement enforcement applies before provider-intensive work and before all user-visible persistence.
- Historical migrations are immutable. Migration `0003` is intentionally absent and must not be recreated.
- Future database changes for this policy must be additive migrations.

## Scheduling requirements

The 6:00 AM ET and 9:15 AM ET system scans require trusted job authentication, schedule idempotency, ET-aware execution semantics, and a verified job-auth pattern. Scheduled scans are system work and must not debit manual-dashboard or guided-scan quota.

## Explicit non-goals

Stripe is not implemented by this policy. This specification does not authorize adding Stripe Checkout, Billing Portal, webhooks, products, prices, environment values, payment activation, or paid-tier payment-provider integration. Any such work requires separate approval and verified, idempotent payment-provider events as the authority for paid tiers.

## Implementation boundaries

Implementation should proceed through independently reviewable pull requests in this order:

1. Central server-only entitlement policy types and resolver with tests.
2. Additive migration-managed usage ledger, scan execution records, visible result records, monitor registry, transition ledger, and notification delivery ledger with RLS.
3. Manual dashboard quota enforcement and server-side result caps.
4. Verified schedule support for 6:00 AM ET and 9:15 AM ET.
5. Eligible monitor lifecycle and idempotent Watch → Execute notification delivery.
6. Plan gates for automation, intraday scans, and backtests.
7. Tests, lint, typecheck, build, and preview verification.

No implementation PR may merge, deploy, apply a production migration, change production configuration, expose or write secrets, change plans, or alter Phase 0 PR #116 without separate action-specific approval.

## Correction (2026-08-26)

Automation was originally listed above as available to Pro, Expert, and Wall Street (the Plan entitlements table's Automation row, and the Operational capacities table's Automation-workflows row, read Yes/5/20 for those three tiers). That conflicted with what was already shipped and confirmed as intentional: `/automation`'s gate (`autonomous_portfolio_manager` in `lib/tiers.ts`, from an earlier PR) has always been Wall Street (`SYSTEM_MASTERY`) only. Corrected here to No/No/No/Yes and 0/0/0/Unlimited to match — confirmed by direct product decision rather than widened to meet this document's original draft.

## Correction (2026-08-29)

This document's "Plan entitlements" table lists "Intraday scans/movement" as No for Pro. By direct product decision (the "Tier Access, Promotion & User Experience" spec pack), Pro now has a distinct, separately bounded intraday module — not a widening of this row's original "No," and not the same unrestricted capability Expert and Wall Street get. The distinction is enforced by a separate entitlement flag, `proIntradayModuleEnabled` (`lib/entitlements/policy.ts`), left `false` for every other tier; `intradayScansEnabled` (the flag this table's row actually describes) is unchanged — still Expert+ only. Pro's module, gated in `app/api/intraday-scan/route.ts`, additionally restricts: setups displayed per day, closed-bar entry confirmation (5/15/30-minute bars only — in practice today only the scanner's 5-minute-bar alerts qualify, since it has no native 15/30-minute path), new entries per day, concurrent positions, a consecutive-loss pause, and a daily-loss lock (`lib/promotion/pro-intraday.ts`, `lib/promotion/config.ts`'s `ProIntradayPolicy`). Read this table's Pro/"Intraday scans/movement" cell as "Yes, bounded module" rather than "No."

## Correction (2026-09-02)

The "Monitor eligibility and lifecycle" section originally read "A user may receive a notification only on a confirmed `WATCH → EXECUTE` transition" — Phase 1 deliberately scoped alerts to that one event. Widened here by direct product decision: a user tracking a setup (via an open `WATCH` or `EXECUTE` monitor) now also receives a notification when that setup breaks (`WATCH`/`EXECUTE` → `INVALIDATED`) — the counterpart event to "this became actionable," namely "this you were tracking no longer holds." `NO_SETUP` and `EXPIRED` remain silent: unlike `INVALIDATED`, neither asserts the setup broke, only that a later scan didn't reconfirm it.

Implementation: `decideTransition` (`lib/entitlements/monitor.ts`) sets `notify: true` for `(WATCH|EXECUTE) → INVALIDATED` the same way it already did for `WATCH → EXECUTE`. The invalidation alert payload is deliberately narrower than the existing `EntitledAlertPayload` (`lib/entitlements/delivery.ts`) — a symbol dropping out of a scan's qualifying results carries no fresh entry/stop/target/score to disclose, only that the tracked setup no longer holds — delivered via a new `EntitledInvalidationPayload`/`sendSetupInvalidatedEmail` (`lib/notifications/resend-handler.ts`) template, through the same `notification_deliveries` idempotency ledger.

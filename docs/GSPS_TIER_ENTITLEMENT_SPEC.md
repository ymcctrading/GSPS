# GSPS Tier Entitlement Specification

**Status:** Phase 1 policy contract

## Purpose

This specification is the server-authoritative product contract for GSPS plans, quotas, setup-result visibility, feature gates, monitoring, and Watch → Execute alerts. It defines intended behavior before implementation. It does not introduce billing, payment activation, Stripe resources, secret values, deployment, or production configuration changes.

## Plan entitlements

| Capability | Novice | Pro | Expert | Wall Street |
|---|---:|---:|---:|---:|
| 6:30 AM ET Morning Preparation scan | Included | Included | Included | Included |
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
| Intraday scan refreshes/day (rolling 7 days) | 0 | 3 (10) | 5 (21) | Unlimited, fair use (automatic refresh) |
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
| Open correlated risk groups (symbols, for now) | 1 | Unlimited | Unlimited | Unlimited |

“Unlimited” does not mean unbounded system consumption. No product daily cap is published, but rate, concurrency, cost, queue, provider, and abuse controls remain enforceable.

## Quota semantics

- A daily quota day is bounded by `America/New_York`.
- The 6:30 AM ET Morning Preparation scan and 9:15 AM ET confirmation scan are automated system work. They do not consume a user’s manual-dashboard or guided-scan quota.
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

- 6:30 AM Morning Preparation output
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

The 6:30 AM ET and 9:15 AM ET system scans require trusted job authentication, schedule idempotency, ET-aware execution semantics, and a verified job-auth pattern. Scheduled scans are system work and must not debit manual-dashboard or guided-scan quota.

## Explicit non-goals

Stripe is not implemented by this policy. This specification does not authorize adding Stripe Checkout, Billing Portal, webhooks, products, prices, environment values, payment activation, or paid-tier payment-provider integration. Any such work requires separate approval and verified, idempotent payment-provider events as the authority for paid tiers.

## Implementation boundaries

Implementation should proceed through independently reviewable pull requests in this order:

1. Central server-only entitlement policy types and resolver with tests.
2. Additive migration-managed usage ledger, scan execution records, visible result records, monitor registry, transition ledger, and notification delivery ledger with RLS.
3. Manual dashboard quota enforcement and server-side result caps.
4. Verified schedule support for 6:30 AM ET and 9:15 AM ET.
5. Eligible monitor lifecycle and idempotent Watch → Execute notification delivery.
6. Plan gates for automation, intraday scans, and backtests.
7. Tests, lint, typecheck, build, and preview verification.

No implementation PR may merge, deploy, apply a production migration, change production configuration, expose or write secrets, change plans, or alter Phase 0 PR #116 without separate action-specific approval.

## Correction (2026-08-26)

Automation was originally listed above as available to Pro, Expert, and Wall Street (the Plan entitlements table's Automation row, and the Operational capacities table's Automation-workflows row, read Yes/5/20 for those three tiers). That conflicted with what was already shipped and confirmed as intentional: `/automation`'s gate (`autonomous_portfolio_manager` in `lib/tiers.ts`, from an earlier PR) has always been Wall Street (`SYSTEM_MASTERY`) only. Corrected here to No/No/No/Yes and 0/0/0/Unlimited to match — confirmed by direct product decision rather than widened to meet this document's original draft.

## Correction (2026-08-29)

This document's "Plan entitlements" table lists "Intraday scans/movement" as No for Pro. By direct product decision (the "Tier Access, Promotion & User Experience" spec pack), Pro now has a distinct, separately bounded intraday module — not a widening of this row's original "No," and not the same unrestricted capability Expert and Wall Street get. The distinction is enforced by a separate entitlement flag, `proIntradayModuleEnabled` (`lib/entitlements/policy.ts`), left `false` for every other tier; `intradayScansEnabled` (the flag this table's row actually describes) is unchanged — still Expert+ only. Pro's module, gated in `app/api/intraday-scan/route.ts`, additionally restricts: setups displayed per day, closed-bar entry confirmation (5/15/30-minute bars only — in practice today only the scanner's 5-minute-bar alerts qualify, since it has no native 15/30-minute path), concurrent positions, a consecutive-loss pause, and a daily-loss lock (`lib/promotion/pro-intraday.ts`, `lib/promotion/config.ts`'s `ProIntradayPolicy`). Read this table's Pro/"Intraday scans/movement" cell as "Yes, bounded module" rather than "No."

## Correction (2026-09-02)

The "Monitor eligibility and lifecycle" section originally read "A user may receive a notification only on a confirmed `WATCH → EXECUTE` transition" — Phase 1 deliberately scoped alerts to that one event. Widened here by direct product decision: a user tracking a setup (via an open `WATCH` or `EXECUTE` monitor) now also receives a notification when that setup breaks (`WATCH`/`EXECUTE` → `INVALIDATED`) — the counterpart event to "this became actionable," namely "this you were tracking no longer holds." `NO_SETUP` and `EXPIRED` remain silent: unlike `INVALIDATED`, neither asserts the setup broke, only that a later scan didn't reconfirm it.

Implementation: `decideTransition` (`lib/entitlements/monitor.ts`) sets `notify: true` for `(WATCH|EXECUTE) → INVALIDATED` the same way it already did for `WATCH → EXECUTE`. The invalidation alert payload is deliberately narrower than the existing `EntitledAlertPayload` (`lib/entitlements/delivery.ts`) — a symbol dropping out of a scan's qualifying results carries no fresh entry/stop/target/score to disclose, only that the tracked setup no longer holds — delivered via a new `EntitledInvalidationPayload`/`sendSetupInvalidatedEmail` (`lib/notifications/resend-handler.ts`) template, through the same `notification_deliveries` idempotency ledger.

## Correction (2026-10-16)

The one-correlated-group ceiling from the Novice Risk, Account & Cooldown Engine spec pack (`lib/risk/config.ts#MAX_CORRELATED_RISK_GROUPS`, stated "at $450") was enforced on every tier. Group membership is approximated by the symbol itself, so the cap held every account, Wall Street included, to one open symbol at a time, and refused a second with "Novice accounts at this equity level may hold only 1 at a time." The cap is now a tier entitlement (`maxCorrelatedRiskGroups`, `lib/entitlements/policy.ts`): 1 for Novice, unlimited above it. The single-position (25%), aggregate (65%) and total-open-risk (2%) ceilings in `lib/risk/position-limits.ts` still apply to every tier.

## Practice accounts, one per tier (2026-10-22, project owner)

"Each tier should have their own 'practice account' so that either level can
be previewed by a potential new user, investor, or current user, weighing,
whether or not they want to pay for/upgrade (and/or graduate) to the next
tier."

- One paper account per tier (`profiles.is_demo`, held to one a tier by
  migration 0106's unique index), each at its tier, so every surface shows
  exactly what that tier gets from the entitlement policy above. The original
  Wall Street demo account is the Wall Street one; the other three are
  created on first open (`lib/demo/practice.ts#ensurePracticeAccount`) with
  `.invalid` addresses and passwords nobody holds.
- GSPS trades each through Guided Mode's pipeline (`lib/demo/auto-trade.ts`,
  `/api/demo/auto-trade?tier=`), three times a trading day per tier (pg_cron),
  under that tier's own rules: the Novice account under Novice's percent
  ceilings. Nothing is relaxed for a practice account.
- Anyone opens one from `/practice` (linked from the home page and
  `/promotion`), which lists each tier's inclusions and the account's record,
  losses included. `/api/demo/open` signs the browser in with a one-time link
  made and redeemed on the server: no email, no shared password.
- A practice session is look-only. `proxy.ts` refuses its API writes
  (`practiceWriteRefused`) except a market scan, the tour, reading a notice
  and switching tier, and migration 0106's restrictive row policies refuse
  the writes a browser makes straight to the database (profile, settings,
  automation, broker connections, watchlists, saved setups, alerts, scripts,
  preferences, critiques), keyed on `app_metadata.practice_tier` in the
  session's token. So the record is GSPS's own trading and nothing a visitor
  typed. Sign out ends only that browser's session (`scope: "local"`), and
  each visitor draws their own rate budget. A banner on every signed-in page
  says which tier it is and that it is paper money.
- Known gap: a password change goes straight to Supabase Auth and can't be
  refused. Opening never uses a password, so it locks nobody out; the
  original Wall Street account's shared password is rotated to a random one
  once `/practice` is live, so nobody depends on it.
- A practice profile's tier is held by the unique index: a server path that
  tried to change it (a promotion, a billing webhook) would fail rather than
  leave two accounts on one tier. Both need requests the proxy refuses.

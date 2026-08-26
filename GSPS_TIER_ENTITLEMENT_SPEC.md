# GSPS Tier Entitlement Specification

**Status:** Phase 1 policy contract

_Mirrors `docs/GSPS_TIER_ENTITLEMENT_SPEC.md` on the `phase1/tier-entitlement-spec` branch (PR #117), commit `f3ed35907047f3f4e91c4e8da42268849295d9ce`. Kept at repo root, alongside `ROADMAP.md`, so future sessions have it without checking out that branch. See the session note at the bottom for the tier-naming decision made after this spec was drafted._

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
| Automation | No | Yes | Yes | Yes |
| Intraday scans/movement | No | No | Yes | Yes |
| Backtesting | No | No | No | Yes |

## Operational capacities

| Capacity | Novice | Pro | Expert | Wall Street |
|---|---:|---:|---:|---:|
| Active Watch → Execute monitors | 15 | 50 | 150 | Unlimited, fair use |
| Automation workflows | 0 | 5 | 20 | Unlimited, fair use |
| Custom alert rules | 10 | 50 | 200 | Unlimited, fair use |
| Saved watchlists | 3 | 10 | 25 | Unlimited, fair use |
| Symbols/watchlist | 25 | 100 | 250 | Unlimited, fair use |
| Scan-history retention (days) | 30 | 90 | 365 | Full available history/fair use |

"Unlimited" does not mean unbounded system consumption. No product daily cap is published, but rate, concurrency, cost, queue, provider, and abuse controls remain enforceable.

## Quota semantics

- A daily quota day is bounded by `America/New_York`.
- The 6:00 AM ET Morning Preparation scan and 9:15 AM ET confirmation scan are automated system work. They do not consume a user's manual-dashboard or guided-scan quota.
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

A user may receive a notification only on a confirmed `WATCH → EXECUTE` transition. The system must persist monitor state, transitions, idempotency information, and delivery records. It must not re-alert an already executed setup unless the setup first leaves `EXECUTE`, returns to `WATCH`, and then reconfirms `EXECUTE`.

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
| 429 | Quota, rate, concurrency, or fair-use exhaustion |
| 503 | Required upstream dependency unavailable; fail closed |

## Session note (added when this file was committed to the repo)

This spec's tier names (Novice/Pro/Expert/Wall Street) do **not** match the
tier system actually shipped and merged into `main`: `lib/tiers.ts` and
`supabase/migrations/0021_billing_tier.sql` (from PRs #23 and #85) define
`PlatformTier = PRACTICE | STANDARD | INVESTOR_MODE | SYSTEM_MASTERY`, gating
entirely different features (`live_execution`, `drawing_tools`, `oscillators`,
`mean_reversion_scanner`, `autonomous_portfolio_manager`) — nothing about scan
quotas, result-visibility caps, or Watch → Execute monitor capacity exists in
that enum today.

**Decision (this session): Option A.** Reuse the existing `platform_tier`
enum and rank order — do not introduce a second tier concept. Map
Novice→PRACTICE, Pro→STANDARD, Expert→INVESTOR_MODE, Wall Street→SYSTEM_MASTERY,
and extend `EntitlementPolicy` in `lib/tiers.ts` with this spec's fields
(quotas, result caps, monitor capacities) rather than a parallel resolver.
`TIER_META.label` values will need to change to match this spec's
user-facing plan names, separately from the enum values, which stay as-is to
avoid touching Stripe/webhook/checkout code that already keys off them.

Phase 3 implementation against this spec should build on that mapping, not
introduce Novice/Pro/Expert/Wall Street as new enum values.

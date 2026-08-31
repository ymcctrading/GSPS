# Claude Code Build Roadmap — Implementation Tracker

Maps every phase and database entity in the uploaded "Claude Code Build
Roadmap & Acceptance Criteria" spec pack (GSPS Implementation Specification
Pack, dated 2026-08-28) to what actually exists in this repository today.
Read-only audit — **no behavior changes in this document itself.**

This is Phase 0 of that pack ("Repository discovery and architecture map").
It supersedes nothing in `ROADMAP.md`, which remains the governing product
roadmap; this tracker exists because the spec pack requires "a single
implementation tracker mapping every requirement ... to code location, test,
and acceptance result."

_Snapshot date: 2026-08-31. Update this file as phases move, per the pack's
own instruction._

## How to read the Status column

- **Done** — implemented, matches or exceeds the spec's acceptance criteria.
- **Partial** — real code exists but doesn't fully meet the acceptance
  criteria as written (gap noted).
- **Missing** — no equivalent exists.

## Phase status

| Phase | Deliverable | Status | Code location | Gap |
|---|---|---|---|---|
| 0 | Repository discovery and architecture map | Done | This file + `GSPS_CLAUDE_CODE_IMPLEMENTATION_HANDOFF.md` | — |
| 1 | Policy/config domain | Done | `lib/policy/store.ts`, `lib/risk/policy.ts`, `lib/universe/policy.ts`, `lib/guided/policy.ts`, `supabase/migrations/0049_domain_policy_values.sql`, `supabase/migrations/0046_tier_promotion_policy.sql` | A generic, domain-scoped `policy_values`/`policy_change_log` pair (0049) extends the versioned-config pattern 0046 established for tier promotion, reused by all three domains below with no new migration per domain. **Risk domain**: `lib/risk/policy.ts` resolves overrides for every circuit-breaker threshold and risk-band rate/cap, wired into `lib/risk/service.ts`'s live evaluation. **Universe domain**: `lib/scanTicker.ts` takes an optional resolved `UniverseThresholds` parameter, and every route that drives a scan (`app/api/scan`, `app/api/batch-scan`, `app/api/guided` + `app/api/guided/execute`, both `runMarketScan` callers) resolves `getUniversePolicy()` once per request/batch and threads it through. **Guided domain**: `lib/guided/policy.ts` resolves `GuidedPolicy` — risk-percent bounds, trade-count/deployed-pct defaults, budget bounds, the minimum tradeable quantity, recommendation TTL, and scan-batching limits — covering the platform ceilings `resolveGuidedCaps` clamps a user's own `settings.prefs.guided` against (distinct from those per-user prefs, which are untouched); `lib/guided/sizing.ts`'s `sizeGuidedTrade` and `lib/guided/eligibility.ts`'s `sizeIsTradeable` take an optional resolved floor; wired into `app/api/guided` and `app/api/guided/execute`. `lib/demo/auto-trade.ts`'s synthetic demo-account scans are deliberately left on code defaults across all three domains — not a real user, no policy relevance. Every new parameter across all three domains defaults to the same code constants each module always used, so no existing call site or test changed behavior. Remaining gap: `policy_values`/`policy_change_log` has no effective-dating or approval workflow, only a change-log trigger (same as 0046) — the spec's "immutable ... with approvals" isn't fully met, just versioned-and-logged. |
| 2 | Account and risk engine | Done | `lib/risk/{account,circuit-breaker,cooldown,dynamic-risk,execution-score,live-account,metrics,position-limits,service,status}.ts`; `supabase/migrations/0042_novice_risk_cooldown_engine.sql`, `0043_risk_live_equity_snapshots.sql` | Verified/estimated account status, sizing, allocation, correlation-adjacent metrics, daily/48h/30d drawdown, and the 8-state circuit breaker are all implemented and tested (`lib/risk/__tests__`). Live-account gating currently has no live order path to actually gate (documented, expected). |
| 3 | Universe/data-quality engine | Done (informational, by decision) | `lib/universe/{eligibility,dataQuality,eventRisk,liquidity,marketCap,priceAccessibility,prohibited,scanGates,smallAccount,spread,volatility}.ts` | Eligibility filter, freshness/data-provenance, event gating, and fail-closed behavior all exist and are wired into `lib/scanTicker.ts` as `ScanResult.noviceUniverse`. By deliberate, documented decision (`docs/MARKET_UNIVERSE_DATA_QUALITY.md`, "Why informational, not gating") this does **not** gate `SignalGates.eligibleUniverse` yet, because earnings-calendar and large-cap-list coverage is too thin to gate the whole scanner without collapsing the tradeable universe. This diverges from the spec's implication that the engine gates entries; the divergence is intentional and documented, not an oversight. |
| 4 | Trend Pullback v1 | Done (as the Signal and Regime Engine) | `lib/signals/{engine,disqualifiers,regime,scoring,scanGates,indicators}.ts`, `lib/signals/states/` | Closed-bar deterministic scan, score explanation, entry/stop/target/expiry all present; wired into scan UI, chart/ticker UI, and notification fan-out. Built as a superset ("Signal and Regime Engine" covering multiple pattern states), not a single named "Trend Pullback v1" module — acceptance criteria are met, naming differs from the spec. |
| 5 | Trade lifecycle | Done | `lib/lifecycle/{expiry,review,schema,store,transitions,types}.ts`; `supabase/migrations/0045_trade_plan_lifecycle.sql` (`trade_plans`, `trade_plan_audit`) | Plan states, TP/runner/Master-Profit floor model, post-close structured review, and audit trail implemented and tested. Kill switch confirmed exempted for protective/closing actions (`lib/trade/kill-switch.ts`, `isProtectiveOrder`), matching "no blocked exits." |
| 6 | Tier UX/promotion | Done | `lib/promotion/*`; `lib/entitlements/*`; `supabase/migrations/0036_entitlement_usage_and_monitors.sql`, `0046_tier_promotion_policy.sql`, `0047_intraday_sourced_orders.sql` | Entitlements, scan limits, readiness/promotion score, and education flow (`components/settings/promotion-settings.tsx`, `novice-home-summary.tsx`) implemented. No Stripe/billing yet (`docs/GSPS_TIER_ENTITLEMENT_SPEC.md` scopes that out deliberately), so "upgrade" is a readiness gate, not a paid transaction — no bypass path exists either way. |
| 7 | Validation and monitoring | Partial | `lib/backtest/{replay,run,attribution,propose-weights,replaySignals}.ts`, `app/api/backtest`, `/learning` page | Backtest replay exists and is real (bar-by-bar replay of shipped entry logic, not a re-implementation), with committable reports (`docs/REPLAY_RESULTS*.md`). What's missing against the spec: no **shadow** module (running the live strategy in parallel against real-time data without executing, to compare live vs. backtest drift), no metrics/alerts dashboard surfacing backtest or live signal-quality trends over time, and no rollback controls beyond normal git/migration revert. This is the one phase with no real home yet. |
| 8 | Additional strategies/markets | Missing (correctly — gated) | — | Spec requires this only after v1 validation gates pass, one at a time. Since Phase 7's validation/monitoring layer isn't built, Phase 8 correctly has not started. Matches `ROADMAP.md` Q2 items (crypto scanner, forex scanner) which are scheduled, not started. |

## Database/domain model additions — spec vs. actual

| Spec entity | Purpose | Actual table(s) | Status |
|---|---|---|---|
| `policy_versions` | Immutable policy config, effective dates, approvals, rollback | `promotion_policy_values`/`promotion_policy_change_log` (0046, tier promotion only); generic `policy_values`/`policy_change_log` (0049, risk, universe, and guided domains all wired into live routes) | Partial — "risk", "universe", "guided", and "promotion" (the last with its own pre-0049 table name) are all read from a live request path today. `policy_values`/`policy_change_log` has no effective-dating or approval workflow, only a change-log trigger, same as 0046. |
| `strategy_versions` | Rules, parameters, score schema, data dependencies, status | — | Missing — signal/scoring parameters live in code (`lib/signals/scoring.ts`), not a versioned DB row. Trade plans reference no `strategy_version_id`. |
| `instrument_eligibility_snapshots` | Universe pass/fail + underlying market/event data | — | Missing — `lib/universe/*` computes eligibility live per scan and publishes it on the scan result; nothing is persisted as a historical snapshot, so past eligibility can't be reconstructed after the fact. |
| `signal_evaluations` | Every scan result, criteria evidence, score, expiry, source timestamps | `scan_results`, `scan_events`, `visible_scan_results`, `signal_lifecycle_events` | Partial — evaluation data is recorded but split across several tables by concern (entitlement-visible results vs. raw scan events vs. lifecycle transitions) rather than one evidence-complete record per evaluation. |
| `trade_plans` | Versioned plan coordinates, sizing, lifecycle state, strategy/policy links | `trade_plans`, `trade_plan_audit` (0045) | Done, except no `strategy_version`/`policy_version` foreign key (follows from the two gaps above) |
| `account_snapshots` | Verified/estimated equity, buying power, holdings, data freshness | `risk_live_equity_snapshots` (0043) | Partial — live-account only; no equivalent snapshot table for paper accounts (paper equity is read live from `paper_accounts`/`positions`, not snapshotted) |
| `risk_snapshots` | Open risk, allocation, correlation, daily/48h/30d drawdown values | `risk_circuit_state`, `risk_circuit_audit_log` | Partial — circuit-breaker state and its audit log exist; metrics (`lib/risk/metrics.ts`) are computed on read, not persisted as periodic snapshots |
| `cooldown_events` | State transitions, trigger data, notification/ack, reset completion | `risk_circuit_audit_log`, `risk_reset_checklists` | Done — functionally equivalent, different names |
| `user_execution_reviews` | Plan-adherence metrics and score inputs | `lib/lifecycle/review.ts` (post-close review), `lib/risk/execution-score.ts` | Partial — logic exists and is tested, but review output isn't persisted to its own table; it's derived on read from `trade_plan_audit`/`positions` |
| `audit_events` | Append-only record of system/user actions, decisions, version refs | `trade_plan_audit`, `risk_circuit_audit_log`, `promotion_policy_change_log`, `monitor_transitions`, `learning_audit_log` | Missing as a unified entity — five separate append-only logs exist, each scoped to its own domain, but there's no single cross-domain `audit_events` table or view. Reconstructing "everything that happened to user X on date Y" means querying all five. |

## Backend enforcement requirements — spec vs. actual

| Requirement | Status | Notes |
|---|---|---|
| Enforce risk/tier/cooldown/eligibility server-side | Done | `lib/entitlements/policy.ts`, `lib/risk/service.ts`, `lib/trade/place-order.ts` gate server-side; UI reflects, doesn't enforce |
| Closed-candle data only for confirmed signals | Done | `lib/signals/engine.ts` |
| Fail closed on stale/unknown account/market/event data | Done | `lib/risk/live-account.ts` fails closed rather than guessing; `lib/universe/dataQuality.ts` |
| Idempotent jobs / unique event keys | Done | `0040_scheduled_scan_job_idempotency.sql`, `0041_phase5_delivery_retry_and_suppression.sql` |
| Transaction boundaries/locking on plan creation and quota consumption | Done | `0039_fix_reserve_usage_slot_ambiguous_status.sql`, atomic reservation RPCs referenced in `lib/entitlements/quota.ts` |
| Rate limits and tier/account authorization | Done | `lib/rate-limit.ts`, `lib/entitlements/policy.ts` |
| Structured rejection reasons | Done | `lib/promotion/copy.ts`, entitlement error shapes in `app/api/*` |
| Never send a live order | Done | `lib/trade/place-order.ts`'s `mode: "live"` branch hard-refuses; no live execution path exists yet |

## What this tracker recommends, in spec priority order

1. **Phase 1 gap: done.** All three policy domains (risk, universe, guided)
   now resolve from `policy_values` and are wired into their live routes —
   see the Phase 1 row above for the full breakdown. What's left is narrower
   than a domain: `policy_values`/`policy_change_log` (0049) has a change-log
   trigger but no effective-dating or approval workflow, so the spec's
   "immutable ... with approvals" is met only partway (versioned-and-logged,
   not gated behind approval). Worth a follow-up if the spec's approval
   requirement is load-bearing; not blocking anything else.
2. **Phase 7 (validation/monitoring) is the real open phase.** Backtesting
   exists; a shadow-mode comparison and a metrics/alerts dashboard do not.
   This is also the spec's own gate for Phase 8 (new strategies/markets),
   so it blocks that expansion regardless of `ROADMAP.md` Q2 timing.
3. **`audit_events` unification** is lower priority — the underlying data
   already exists in five domain-scoped logs — but worth a follow-up decision
   on whether to consolidate into one table/view or formally document why five
   is intentional (defense in depth / smaller blast radius per domain).
4. Phase 8 stays correctly un-started until Phase 7 lands.

_Update (this revision):_ the guided domain closes out the Phase 1 gap.
`lib/guided/policy.ts` resolves `GuidedPolicy` from `policy_values` (domain
`"guided"`, no new migration — reuses 0049), covering the platform ceilings
`resolveGuidedCaps` clamps a user's own preferences against, plus the minimum
tradeable quantity, recommendation TTL, and scan-batching limits.
`app/api/guided` and `app/api/guided/execute` both resolve it and thread it
through `resolveGuidedCaps`, `buildRecommendations`, `sizeGuidedTrade`, and
`sizeIsTradeable`. Phase 1 is now Done; Phase 7 is the sole remaining open
phase from this tracker's original recommendations.

_Update (previous revision):_ the universe-domain slice was wired into every
live scan route — `lib/scanTicker.ts` and every route/service that drives it
(`app/api/scan`, `app/api/batch-scan`, `app/api/guided`,
`app/api/guided/execute`, `lib/marketScan.ts`'s `runMarketScan` and its two
callers) resolve `getUniversePolicy()` once per request/batch via a
service-role client and thread the result through.

_Update (earlier revision):_ the universe-domain resolver and per-module
threshold overrides landed first, not yet wired to a live route. The
risk-domain slice landed before that — see `lib/risk/policy.ts`,
`supabase/migrations/0049_domain_policy_values.sql`, and the threshold
overrides added to `lib/risk/circuit-breaker.ts`/`lib/risk/dynamic-risk.ts`.

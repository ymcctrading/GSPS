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
| 1 | Policy/config domain | Partial | `lib/risk/config.ts`, `lib/universe/config.ts`, `lib/guided/config.ts`, `supabase/migrations/0046_tier_promotion_policy.sql` | Only tier-promotion thresholds are DB-versioned (`promotion_policy_values`/`promotion_policy_change_log`, with approvals + change log). Risk-band rates, cooldown thresholds, universe criteria, and guided sizing are hardcoded TypeScript constants — no DB table, no effective-dating, no rollback. Spec explicitly requires "no hard-coded UI policy values" for this whole domain, not just promotion. |
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
| `policy_versions` | Immutable policy config, effective dates, approvals, rollback | `promotion_policy_values`, `promotion_policy_change_log` (0046) | Partial — exists only for tier-promotion thresholds, not risk/universe/guided config (see Phase 1 gap above) |
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

1. **Close the Phase 1 gap first** (small, mechanical, unblocks nothing else
   but is explicitly called out twice in the spec — "no hard-coded UI policy
   values" and the `policy_versions` entity). Extend the `promotion_policy_values`
   pattern to risk bands, cooldown thresholds, and universe criteria: one
   generic versioned-config table + change log, with `lib/risk/config.ts` and
   `lib/universe/config.ts` reading from it (falling back to today's
   constants as seed defaults) instead of hardcoding.
2. **Phase 7 (validation/monitoring) is the real open phase.** Backtesting
   exists; a shadow-mode comparison and a metrics/alerts dashboard do not.
   This is also the spec's own gate for Phase 8 (new strategies/markets),
   so it blocks that expansion regardless of `ROADMAP.md` Q2 timing.
3. **`audit_events` unification** is lower priority — the underlying data
   already exists in five domain-scoped logs — but worth a follow-up decision
   on whether to consolidate into one table/view or formally document why five
   is intentional (defense in depth / smaller blast radius per domain).
4. Phase 8 stays correctly un-started until Phase 7 lands.

None of the above is implemented in this PR — this is Phase 0 only, per the
spec's "No behavior changes yet" instruction for that phase.

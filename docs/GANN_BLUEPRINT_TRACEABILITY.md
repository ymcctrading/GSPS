# GSPS Implementation Blueprint — traceability matrix

Milestone 0 of the "GSPS Implementation Blueprint" (v1.0, 2026-09-08, project
owner — the authoritative Claude-implementation spec that supersedes the
earlier "GSPS Gann-Centered Foundation" plain-English report for exact
Digital Root/Vortex API details) requires locating the actual codebase and
producing a traceability matrix — existing / partial / absent / contradictory
— before changing logic. This is that matrix, section by section. It reflects
a targeted audit against the areas the blueprint calls out, not a
line-by-line review of every file; where a row says "not deep-audited," treat
it as unverified rather than assumed passing.

Status legend: **Existing** (built, semantically equivalent even if named
differently) · **Partial** (some of the requirement is met) · **Absent**
(not built) · **Not deep-audited** (out of this pass's scope).

**Follow-up pass (2026-09-09):** three of the "Partial"/"Not deep-audited"
rows this matrix originally flagged — confluence transition types, pivot
confirmation timestamps, and the normalized Gann-angle slope — were closed
out as the top-priority, low-risk items (well-specified, no DB migration
needed). Marked **Existing (follow-up PR)** below. The two remaining hard
gaps (literal DB table alignment, futures/forex/options adapters) and the
still-open Partial/Not-deep-audited rows were deliberately left for a
separate scoping conversation, per this doc's own closing section.

**Second follow-up pass (2026-09-09):** closed the Sara Sniper
`StrategyResult` interface (a real Partial row) and verified five more rows
that were only "Not deep-audited" for lack of a targeted look — anchored
VWAP, measured move, the manual-scans-per-day table, and the Wall-Street
stop-override gate were all already built; event-aware/news state
(`lib/universe/eventRisk.ts`) likewise. One row flipped the other way:
instrument behavior profiles were checked and are genuinely **Absent** — no
per-instrument "habits" concept exists anywhere in this codebase. Marked
**Existing (verified this pass)** / **Existing (follow-up PR)** / **Absent**
below accordingly.

## 1–2. Mission, doctrine, terminology

| Blueprint requirement | Status | Where |
|---|---|---|
| Gann-as-sun operating philosophy (price/time/volume/supply-demand/discipline) | Existing | `docs/GANN_SARA_CONFLUENCE.md`, `docs/DOCTRINE_ALIGNMENT_STATUS.md` |
| Digital root 1–9 only, 0 = absence, never guessed as root 9 | **Existing (this PR)** | `lib/gann/digitalRoot.ts` |
| `digital_root_1_to_9`, `calculate_gann_dr`, `gann_complement`, `resolves_to_completion`, `vortex_class` | **Existing (this PR)** | `lib/gann/digitalRoot.ts` — direct ports, same formulas/tables |
| Full DR provenance (`raw_value`, `normalization_method`, `integer_value`, `mod9_residue`, `active_digital_root`, `input_timestamp`, `source_timeframe`, `feature_version`) | **Existing (this PR)**, not yet persisted | `DigitalRootFeature` in `lib/gann/digitalRoot.ts`; no DB table writes it yet (see §5 below) |
| Confluence types (`NO_CONFLUENCE` … `MULTI_FACTOR_CONFLUENCE`) | **Existing (follow-up PR)** | `classifyConfluence` (single-snapshot) + `classifyRootTransition` (`VORTEX_FLOW_TRANSITION`/`ONE_RENEWAL_TRANSITION`, taking a prior reading as an explicit optional argument rather than reading persisted state — nothing stores one yet, so a caller with one in memory can now supply it via `GannConfluenceInputs.previousVortexRoots`). The two transition types' exact trigger condition is a documented interpretation (the blueprint names them without a formula) — see `lib/gann/digitalRoot.ts` |

## 3. Gann-derived requirements table

| Blueprint principle | Status | Where |
|---|---|---|
| Price+volume/participation required for trade eligibility | Existing | `lib/scan/liquidity.ts`, `lib/universe/eligibility.ts` |
| Time-in-range / bars-since-pivot measurement | Existing | `lib/analysis/pivots.ts`, `lib/gann/timeCycles.ts`; now also `vortexContext.timeDisplacement` |
| Liquidity/float/market-cap context | Existing | `lib/universe/eligibility.ts` |
| Multi-timeframe trend/swing structure | Existing | `lib/signals/regime.ts`, `lib/signals/states/*` |
| No-trade / cooldown / fixed invalidation | Existing | `lib/signals/disqualifiers.ts`, novice cooldown rules |
| Deterministic stop required for every trade plan | Existing | `lib/trade/protocol-exit.ts`, `lib/guided/sizing.ts` |
| Instrument behavior profiles | Absent | No per-instrument "habits" behavioral-profile concept exists in the codebase (checked this pass); a real gap, not yet scoped |
| Event-aware state / news discounting | **Existing (verified this pass)** | `lib/universe/eventRisk.ts`, wired through `lib/universe/eligibility.ts` |

## 4. Winning formula & condition hierarchy

| Blueprint requirement | Status | Where |
|---|---|---|
| Multi-factor confluence formula | Existing | Four scanner states + Gann/Sara confluence layers, `lib/signals/engine.ts` |
| 9-level mandatory condition hierarchy (data → risk → regime → structure → volume → time → Gann/DR → Sara trigger → position mgmt) | Existing, matching order | `docs/GANN_SARA_CONFLUENCE.md`'s decision hierarchy — verified against this blueprint section, order matches |
| Five mutually-exclusive strategy families incl. `NO_TRADE` | Existing, different names | `trendBreakout`≈`MOMENTUM_CONTINUATION`, `confirmedReversal`≈`MEAN_REVERSION`, `trendPullback`≈`PULLBACK_CONTINUATION`, `rangeReversion`≈`RANGE_ROTATION`, disqualified/not-tradeable≈`NO_TRADE`. Internal vocabulary intentionally doesn't mirror the blueprint's exact enum names (see `scripts/check-banned-terms.mjs`) |

## 5. Architecture & data model

| Blueprint requirement | Status | Where |
|---|---|---|
| Module pipeline (data → normalization → structure → supply-demand → time → Gann coordinate → Vortex/DR → ensemble → Sara → classifier → risk → ranking → audit → backtest) | Partial | Equivalent modules exist (`lib/signals/*`, `lib/gann/*`, `lib/entitlements/*`, `lib/backtest/*`) but are not organized as this exact named pipeline |
| Literal tables (`instrument`, `bar`, `pivot`, `trend_state`, `digital_root_feature`, `experiment_registry`, …) | Absent as named tables | GSPS's Supabase schema uses different table names covering overlapping ground (`scan_results`, `daily_scans`, `trade_plans`, `strategy_modules`, `gann_evaluations`/`sara_evaluations`, `learning_models`) — not a 1:1 match. No migration added in this PR; schema changes need explicit confirmation |
| Full audit-field set per signal (`signal_id`, `data_vendor`, `why_actionable[]`, …) | Partial | Canonical decision record work is explicitly open — see `docs/CANONICAL_DECISION_RECORD_DESIGN.md` and the "still open" table in `docs/DOCTRINE_ALIGNMENT_STATUS.md` |

## 6. Data normalization

| Blueprint requirement | Status | Where |
|---|---|---|
| Tick-based normalized integer measures | Partial | `lib/trade/tick-size.ts` has real per-instrument tick metadata but is wired to order pricing, not the confluence engine; `lib/signals/confluence/gann.ts` now normalizes with a documented fixed cents convention rather than per-instrument ticks — noted as a simplification in code |
| Per-asset-class adapters (equities/futures/forex/crypto/options) | Partial | `lib/signals/confluence/marketAdapters.ts` covers equities/crypto only; futures/forex/options report `unsupported` rather than approximating adapter mechanics that don't exist |

## 7. Vortex/digital-root engine

**Existing as of this PR** — `lib/gann/digitalRoot.ts` + `GannConfluenceResult.vortexContext` in `lib/signals/confluence/gann.ts`. Confluence/context-only, matching blueprint 7.4's safety rule by construction (never sets `alignment`, never touches a gate).

## 8. Gann coordinate engine

| Blueprint requirement | Status | Where |
|---|---|---|
| Objective N-bars-before/after pivot rule, usable only after confirmation bars close | Existing | `lib/analysis/pivots.ts`'s `findPivots` — a pivot is only ever returned once its confirming bars exist in the input array |
| Explicit `pivot_occurrence_timestamp`/`pivot_confirmation_timestamp` fields | **Existing (follow-up PR)** | `Pivot.occurrenceTimestamp`/`.confirmationTimestamp` in `lib/analysis/pivots.ts` |
| Candidate coordinates (swing high/low, prior D/W/M high-low, range fractions, measured move, anchored VWAP, Square-of-9, ATR bands) | Partial | Square-of-9 (`lib/gann/squareOf9.ts`), fans (`lib/gann/fans.ts`), time cycles (`lib/gann/timeCycles.ts`), anchored VWAP (`lib/signals/indicators.ts`), and measured move (`lib/signals/states/{confirmedReversal,rangeReversion,trendBreakout}.ts`) all exist — verified this pass; prior D/W/M high-low and range-fraction coordinates as a unified Gann "coordinate ledger" object are not deep-audited |
| Normalized Gann-angle slope (price/ATR/bar, not screen pixels) | **Existing (follow-up PR)** | `lib/gann/normalizedSlope.ts` (`normalizedSlope`/`nearestGannAngle`), wired into `GannConfluenceResult.angleSlope` |

## 9–10. Supply-demand/volume/volatility engine & strategy engines

| Blueprint requirement | Status | Where |
|---|---|---|
| Relative volume, ATR/ATR percentile, true-range percentile, close-location value, liquidity score | Existing | `lib/signals/indicators.ts`, `lib/analysis/pivots.ts` (`atr`), `lib/scan/liquidity.ts` |
| Acceptance/rejection state classification (accepted/rejected upside/downside expansion) | Existing, different vocabulary | `lib/signals/regime.ts` + the four scanner states encode this distinction without using the blueprint's exact state names |
| Mean-reversion / momentum-continuation / pullback-continuation / range-rotation engines | Existing, different names | `lib/signals/states/confirmedReversal.ts`, `trendBreakout.ts`, `trendPullback.ts`, `rangeReversion.ts` |
| No-trade engine with the full listed condition set | Existing | `lib/signals/disqualifiers.ts` |

## 11. Sara Sniper Strategy

| Blueprint requirement | Status | Where |
|---|---|---|
| Locate/inventory existing rules rather than inventing them | Already done (prior PR) | `lib/signals/confluence/sara.ts` wraps `lib/strat/patterns.ts`'s existing closed-bar pattern taxonomy — see `docs/GANN_SARA_CONFLUENCE.md` |
| `StrategyResult` interface (`strategy_id`, `status: WATCH/DEVELOPING/ACTIONABLE/NO_TRADE`, `entry_trigger`, `conditions_met/failed`, …) | **Existing (follow-up PR)** | `toSaraStrategyResult` (`lib/signals/confluence/strategyResult.ts`) reshapes `SaraConfluenceResult` into the blueprint's exact field set. `DEVELOPING` status, real `targets`/`timeStopBars`, and `featureSnapshotId` are honestly `null`/unreachable rather than fabricated — Sara's module doesn't compute a graduated confirmation state, targets, or a persisted snapshot id today |

## 12–17. Indicators, risk/targets, scoring/tiers, backtesting, asset classes, UX

| Blueprint requirement | Status | Where |
|---|---|---|
| ATR/rel-vol/VWAP/MA/prior-swing/RSI/MACD as supporting-only indicators | Existing | `lib/signals/indicators.ts` |
| Position sizing (`risk_per_share`, `max_dollar_risk`, floor division) | Existing, superset | `lib/guided/sizing.ts` implements five ceilings (risk/portfolio/buying-power/budget/tradeability), a superset of the blueprint's basic formula |
| Novice: swing-only, 3 trades/day, cooldown at 3 trades or 18%/48h loss | Existing | `lib/promotion/`, `lib/universe/eligibility.ts` — confirmed present in an earlier pass this session |
| Loss notifications 6/9/15%, hard warning 30%, auto-close 50% | Existing, exact match | `lib/risk/live-trade-loss.ts` |
| Stop-loss expansion Wall-Street-only, post-warning, verified enrollment | **Existing (verified this pass)** | `lib/risk/stop-override.ts` — high-friction warning acknowledgement required before a verification email is even sent, plus a token-gated confirm step |
| Tier max setups/scan: Novice 6, Pro 12, Expert 20, Wall Street 30 | Existing, exact match | `lib/entitlements/policy.ts` |
| Manual dashboard scans/day: 1/3/6/unlimited | **Existing (verified this pass)**, exact match | `lib/entitlements/policy.ts`'s `manualDashboardScansPerDay` |
| Scoring bands (0–24 NO_TRADE … 85–100 HIGH_CONFLUENCE) | Not deep-audited | GSPS has its own tier/score system (`lib/signals/types.ts` `RulesAlignmentTier`); not compared band-for-band against the blueprint's exact thresholds |
| Backtest bias controls (look-ahead, survivorship, data-snooping, walk-forward, permutation tests, block bootstrap) | Partial | `lib/backtest/*`, `docs/VALIDATION_BACKTESTING_AUDIT_COMPLIANCE.md` cover some of this; a control-by-control audit against the blueprint's full list was not performed this pass |
| Futures/forex/options execution constraints (tick value, roll, pip, Greeks, assignment) | Absent | No futures/forex data path exists in GSPS yet; options adapter is not built (`lib/signals/confluence/marketAdapters.ts` reports both `unsupported`) |
| Required plain-English signal explanation + warning language | Partial | `GSPS_LABELS`/`GSPS_TOOLTIPS`/`GSPS_DISCLAIMER` (`lib/constants/gspsTerminology.ts`) cover the general case; not verified against this blueprint's specific explanation checklist item-by-item |

## 18–21. API contract, milestones, acceptance criteria, decision law

The section 18 `gann_context` shape (`price_dr`, `time_dr`, `relationship`,
`vortex_class`, `research_status`) is now what `GannConfluenceResult.vortexContext`
produces, field-for-field in spirit (camelCase, `research_status` implicit
since every DR field here is unconditionally `EXPERIMENTAL` — nothing in this
PR promotes a DR/Vortex feature to `VALIDATED`, which requires the backtest
promotion pipeline in blueprint §15, not yet run for this feature).

Milestones 2 ("Structure and market-state engines"), most of 5–7 (full UX
rewrite to blueprint vocabulary, research platform additions, paper-to-live
reconciliation workflow) are **not** undertaken in this PR — they're
existing-but-differently-named or open items already tracked in
`docs/DOCTRINE_ALIGNMENT_STATUS.md`, and re-litigating GSPS's whole
architecture to match this blueprint's exact naming/schema would be a
multi-week rewrite, not something to do unprompted in one pass. This matrix
is the input for deciding, with the project owner, which of those gaps (if
any) are worth closing next.

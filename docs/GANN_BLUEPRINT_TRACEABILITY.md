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

**Third follow-up pass (2026-09-09):** a separate PR performed the
control-by-control backtest bias audit this doc's §12–17 row previously
deferred — see `docs/GANN_BLUEPRINT_BACKTEST_BIAS_AUDIT.md` and the updated
row below. 7/14 bias controls and 2/9 validation requirements are existing;
the rest are partial/absent, with survivorship bias, permutation tests,
block bootstrap, multiple-testing correction, confidence intervals, and true
multi-era walk-forward named as a coherent statistical-methodology scope for
a future initiative rather than implemented shallow in that pass.

**Fourth follow-up pass (2026-09-09):** the blueprint's literal source text
(`docs/doctrine/GSPS_Claude_Implementation_Blueprint_Gann_Centered.pdf`) is
now checked into the repo, resolving the reason the coordinate-ledger,
§17.1-checklist, and scoring-band rows had stayed unstarted — prior passes
only had the blueprint's content by way of a session's own context, not a
committed source. This pass: (1) built `lib/gann/coordinateLedger.ts`,
closing the one real gap in blueprint §8.3's candidate-coordinate list
(prior D/W/M high-low, range fractions); (2) audited §17.1's 12-item
signal-explanation checklist item-by-item and surfaced a genuine
architectural tension, not just a gap — see below; (3) compared GSPS's
actual scoring system against §14's 0–100/5-band spec and found it's a
deliberately different, already-calibrated shape, not an unfinished one.

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
| Candidate coordinates (swing high/low, prior D/W/M high-low, range fractions, measured move, anchored VWAP, Square-of-9, ATR bands) | **Existing (this PR)** | Square-of-9 (`lib/gann/squareOf9.ts`), fans (`lib/gann/fans.ts`), time cycles (`lib/gann/timeCycles.ts`), anchored VWAP (`lib/signals/indicators.ts`), and measured move (`lib/signals/states/{confirmedReversal,rangeReversion,trendBreakout}.ts`) already existed; prior D/W/M high-low and range fractions were the one genuinely missing piece — `lib/gann/coordinateLedger.ts`'s `buildCoordinateLedger` now generates them in the exact §8.3 storage shape (`coordinate_type`, `anchor_id`, `formula_description`, `parameter_values`, `price_level`, `side`, `confidence_basis`, `research_status`) and is wired into `GannConfluenceResult.coordinateLedger`, confluence-only per the same safety rule as every other field on that result. Windows are trailing-session counts (1/5/21), not calendar week/month boundaries — a documented interpretation, not a literal reading of the blueprint text, which doesn't specify one |
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
| Scoring bands (§14.2: 0–24 NO_TRADE, 25–49 WATCH, 50–69 DEVELOPING, 70–84 ACTIONABLE, 85–100 HIGH_CONFLUENCE, over 12 named §14.1 score components incl. `digital_root_vortex_score`/`sara_sniper_trigger_score`) | **Audited this pass — different shape by design, not a gap** | GSPS runs two parallel scales, neither of which is a 0–100/5-band system: (1) `lib/scoring/score.ts`'s live-scan/replay score — 9 unweighted criteria, 3 bands (Execute 7–9, Watch 4–6, Reject 0–3), no digital-root/Sara component since neither is wired into scoring (`GannConfluenceResult`/`SaraConfluenceResult` are confluence-only per §7.4/§11's own safety rule — see rows above); (2) the Signal & Regime Engine's independent `RulesAlignmentTier` (`watchlistOnly`/`qualified`/`aTier`/`aPlusTier`, `lib/signals/types.ts`). Blueprint §14.2 itself says its thresholds "are placeholders and must be calibrated through research," so a literal band-for-band port isn't what the spec is actually asking for — the real open question is whether GSPS's already-calibrated 3-band/4-tier system should someday grow a 5-band or 12-component shape, which is a product decision, not a code fix. Not changed this pass |
| Backtest bias controls (look-ahead, survivorship, data-snooping, walk-forward, permutation tests, block bootstrap) | **Audited (prior PR)** — 7/14 bias controls + 2/9 validation requirements existing, rest partial/absent | Full control-by-control breakdown in `docs/GANN_BLUEPRINT_BACKTEST_BIAS_AUDIT.md`. Real remaining gaps (survivorship, permutation tests, block bootstrap, multiple-testing correction, confidence intervals, true multi-era walk-forward) are statistical-methodology work, deliberately not attempted shallow in that pass — see that doc's "Reading this" section |
| Futures/forex/options execution constraints (tick value, roll, pip, Greeks, assignment) | Absent | No futures/forex data path exists in GSPS yet; options adapter is not built (`lib/signals/confluence/marketAdapters.ts` reports both `unsupported`) |
| Required plain-English signal explanation + warning language | **Audited this pass — Partial, with an architectural tension** | §17.2's warning language is covered near-verbatim by `GSPS_DISCLAIMER`/`GSPS_RISK_REMINDER`. §17.1's 12-item checklist: see "§17.1 signal-explanation checklist audit" below |

## §17.1 signal-explanation checklist audit (fourth follow-up pass, 2026-09-09)

The blueprint's literal text (`docs/doctrine/GSPS_Claude_Implementation_Blueprint_Gann_Centered.pdf`,
now checked into the repo — see below) requires each surfaced setup to answer
12 specific questions in plain English. Item-by-item:

| # | Question | Status | Where |
|---|---|---|---|
| 1 | What is price doing? | Partial | Computed internally (`lib/signals/regime.ts`, structure classification) but not assembled into one plain-English sentence anywhere customer-facing |
| 2 | What is volume doing? | Partial | `lib/signals/indicators.ts` computes relative volume; no per-setup customer-facing sentence states it |
| 3 | What is volatility doing? | Partial | ATR/ATR-percentile computed (`lib/signals/indicators.ts`); same gap as volume |
| 4 | What is the higher-timeframe trend? | Existing | `GSPS_LABELS.trendCheck`/`GSPS_TOOLTIPS.trendCheck` ("Confirmation from a higher timeframe that the setup's direction still holds") is customer-facing and on-topic |
| 5 | Where is price relative to the mapped Gann coordinates? | **Built, but not surfaced to the user** | `GannConfluenceResult.evidence.explanationTrace` (`lib/signals/confluence/gann.ts`) states this in plain English server-side — but `lib/signals/publicSummary.ts`'s `redactGannConfluence` strips `explanationTrace` before any API response leaves the server, and no UI component renders it either. See "Architectural tension" below |
| 6 | What are the digital roots and Vortex classifications? | **Deliberately never surfaced** | Same `explanationTrace` mechanism as #5 computes this server-side, but `GSPS_TERM_REPLACEMENTS` (`lib/constants/gspsTerminology.ts`) maps `"Digital Root"`/`"Vortex"` to generic customer copy ("GSPS Signal Calculation"/"Signal Flow") by explicit brand-guide policy — a user is never shown these terms at all, which is the opposite of what this checklist item asks for |
| 7 | Is the root feature experimental or validated? | Partial | `research_status`/`DigitalRootFeature` carries this server-side (always `EXPERIMENTAL` today, correctly — see §18–21 below); not shown to the user, same redaction as #5–6 |
| 8 | Why is this a reversion/continuation/pullback/range-rotation/no-trade state? | Partial | `GSPS_STATUS_LABELS` (`lib/constants/gspsTerminology.ts`) gives a generic status word ("Building", "Active", "No Clear Setup"); no per-setup "why" sentence naming which of the five state families applies |
| 9 | What exact event triggers entry? | Partial | `GSPS_LABELS.confirmation` ("A signal that the setup has met its criteria to act on") is generic; `StrategyResult.entryTrigger` (`lib/signals/confluence/strategyResult.ts`) carries the real value but only for Sara, and that interface isn't itself customer-facing copy |
| 10 | What invalidates the thesis? | **Existing** | `GSPS_LABELS.riskLevel`/`GSPS_TOOLTIPS.riskLevel` ("The price level where the original trade idea may no longer be valid.") is exactly this, customer-facing |
| 11 | What are targets and their formulas? | Partial | `GSPS_LABELS.firstTarget`/`finalTarget` name the levels; no "formula" (e.g. "3R projection" vs. "snapped to structural level," per `docs/BACKTESTING.md`'s master-target description) is ever surfaced |
| 12 | What risks exist? | Existing, general only | `GSPS_DISCLAIMER`/`GSPS_RISK_REMINDER` cover risk in general; no per-setup risk callout (e.g. thin liquidity, event risk) beyond the generic language |

**Net: 2/12 existing, 1/12 deliberately not done, 9/12 partial** — the
underlying data mostly exists (computed in `explanationTrace` or elsewhere
server-side) but is not assembled into the single, per-setup, 12-point
plain-English explanation the blueprint asks for.

**Architectural tension, not just a gap.** `lib/scoring/public-summary.ts`
and `lib/signals/publicSummary.ts` implement a *deliberate* opposite
principle: strip the per-criterion breakdown and `explanationTrace` at the
API boundary so "anyone who can read the whole model out of a network
response" can't — see that file's own header comment. The blueprint's ask
(surface a full 12-item explanation per setup, naming digital roots and
Vortex classifications explicitly) runs directly against that IP-protection
design and against the brand guide's term-replacement policy. Reconciling
the two — e.g. a redacted-but-still-plain-English per-setup explanation
object that hits items 1–3, 8, 9, 11 without leaking the scoring model or
the internal vocabulary — is a real product/IP decision, not a code fix,
and is not attempted in this pass.

**The blueprint document itself is now in the repo**
(`docs/doctrine/GSPS_Claude_Implementation_Blueprint_Gann_Centered.pdf`),
alongside the other source specs in `docs/doctrine/`. Prior passes on this
traceability matrix worked from context handed to whichever session did
them; this is the first pass with the literal text checked in, so future
verification (this checklist, the scoring bands above, or anything else
tied to specific blueprint wording) no longer depends on a session having
been given the text out-of-band.

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

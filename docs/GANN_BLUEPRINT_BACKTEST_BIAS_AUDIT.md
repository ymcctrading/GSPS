# Backtest bias-control audit — GSPS Implementation Blueprint §15.4/15.5

Targeted audit of `lib/backtest/*`, `lib/validation/*`, `docs/BACKTESTING.md`,
and `docs/VALIDATION_BACKTESTING_AUDIT_COMPLIANCE.md` against the two lists
the "GSPS Implementation Blueprint" (v1.0, 2026-09-08) gives in §15.4 (bias
controls) and §15.5 (validation requirements) — the item flagged as
"Partial... a control-by-control audit was not performed" in
`docs/GANN_BLUEPRINT_TRACEABILITY.md`.

This is an audit, not an implementation pass. Several genuine gaps below
(permutation tests, block bootstrap, multiple-testing correction, confidence
intervals, true multi-era walk-forward, a survivorship-safe universe) are
real statistical-methodology work, not code that can be safely bolted on in
an afternoon — doing them shallow would produce false rigor, which is worse
than the honest "not built" this codebase already practices elsewhere (see
`docs/BACKTESTING.md`'s own "Nobody has run that check yet" and quarantine
mechanism). They're named here so a scoping decision can be made
deliberately, matching how `docs/VALIDATION_BACKTESTING_AUDIT_COMPLIANCE.md`
deferred Monte Carlo/stress-tests to Q2 rather than shipping something thin.

## §15.4 — Bias controls

| Bias | Status | Notes |
|---|---|---|
| Look-ahead bias | **Existing** | `lib/backtest/replay.ts` replays the shipped scoring/pattern functions bar by bar; daily context reads only sessions strictly before the day traded (`docs/VALIDATION_BACKTESTING_AUDIT_COMPLIANCE.md`) |
| Future-known pivots | **Existing** | `findPivots` (`lib/analysis/pivots.ts`) never returns a pivot before its confirming bars exist in the array — reinforced by the `occurrenceTimestamp`/`confirmationTimestamp` audit fields added this session |
| Survivorship bias | **Absent** | The replay runs whatever symbol list is passed on the command line/API (e.g. `SPY,AAPL,AMD,TSLA,MSFT,NVDA` in the committed runs) — a hand-picked, currently-tradable universe, not a point-in-time constituent list. No delisted-symbol handling exists to check against |
| Delisting bias | **Absent** | Same root cause as survivorship: nothing in `lib/backtest/*` models a symbol leaving the universe mid-window |
| Corporate-action bias | **Partial** | `lib/data/alpaca.ts` requests split-adjusted OHLCV (`params.adjustment = "split"`); dividend-adjustment is not verified |
| Data-snooping bias | **Existing** | `lib/backtest/propose-weights.ts`'s guardrails — chronological (not shuffled) train/check split, informative-in-both-halves requirement, sign agreement, effect floor |
| Curve fitting | **Existing** | Same guardrails — steps capped at a third of a weight, weights clamped to [0.5, 2], renormalized; a proposal is a `draft` row, never auto-promoted |
| Multiple testing | **Absent** | Nine criteria are each tested independently in `propose-weights.ts` with no correction (Bonferroni, false-discovery-rate, or otherwise) across the family of tests |
| Cherry-picking | **Existing (practice + one code guardrail)** | `scripts/replay-report.mjs` refuses to write a report from synthetic bars; beyond that, this is enforced by disclosure culture, not code — `docs/BACKTESTING.md` publishes an inversion (Execute worst on a 2-year sample) rather than only the favorable 2-month run |
| Selection bias | **Partial** | Same as survivorship — the symbol universe for a given replay run is chosen by the caller, not drawn by a documented, reproducible rule |
| Regime selection bias | **Existing (acknowledged, unresolved)** | `docs/BACKTESTING.md`'s "The verdict ladder has not held up out of sample" section explicitly separates a timeframe effect from a regime effect as an open question, and states the rule not to re-weight anything until it's settled — this *is* the control (refusing to act on an unresolved regime confound), just not yet closed out |
| Unrealistic fill assumptions | **Existing** | `docs/BACKTESTING.md`: "a setup may only trigger on the very next bar, a bar covering both stop and target counts as a loss" — deliberately pessimistic, not optimistic |
| Ignored transaction costs | **Existing** | `ReplayOptions.costPerShare`, round-trip friction charged on every trade; slippage-sensitivity re-run available |
| Ignored market impact | **Absent** | No market-impact model (price moving against size) exists; only spread/commission-shaped costs are charged |

## §15.5 — Validation requirements

| Requirement | Status | Notes |
|---|---|---|
| Dev → validation → locked out-of-sample sample | **Partial** | `propose-weights.ts` is a **two**-way chronological split (train/check), not three separate samples with a locked-OOS set never touched during iteration |
| Walk-forward test across multiple eras | **Partial** | The same two-way split is a single walk-forward step, not a rolling multi-era walk-forward (fit on era N, test on N+1, roll forward). `docs/VALIDATION_BACKTESTING_AUDIT_COMPLIANCE.md` explicitly scopes full walk-forward/Monte Carlo to Q2 |
| Post-cost test | **Existing** | Same `costPerShare` friction as above, charged before any expectancy number is reported |
| Block bootstrap / dependent-data resampling | **Absent** | No resampling of any kind over the trade sequence exists |
| Permutation tests for root labels/conditions | **Absent** | Directly relevant to the new Digital Root/Vortex work (#182/#184/#186): nothing shuffles/permutes a root label and re-measures to test whether its apparent effect beats chance |
| Confidence intervals | **Absent** | `attributeFactors` reports a point-estimate correlation/`deltaExpectancyR`, gated by the `MIN_SAMPLES_PER_ARM` (10) floor, but no interval around it |
| Multiple-testing correction | **Absent** | Same gap as §15.4's "Multiple testing" row |
| Ablation (same model minus the candidate root/Vortex/Gann feature) | **N/A today** | The Digital Root/Vortex engine (`lib/gann/digitalRoot.ts`) is confluence/context-only — it is not wired into `lib/scoring/score.ts`'s nine criteria or any weight, so there is no "model with the feature" to ablate against yet. This becomes a real, needed control the moment (if ever) a root/Vortex feature is proposed for promotion into scoring — see the blueprint's own promotion gate in §15.6 |
| Paper-trading reconciliation before live automation | **Partial** | `lib/portfolio/order-status.ts`'s `reconcileOrders` reconciles the local order ledger against the broker's live status — but that's operational sync, not the blueprint's ask (comparing backtest-predicted performance/slippage against realized paper-trading results before promoting to live). No such comparison exists |

## Reading this

Fourteen bias controls: **7 existing, 5 partial/acknowledged-open, 2 absent**
(survivorship, market impact — delisting is the same root cause as
survivorship, multiple testing is its own absent item). Nine validation
requirements: **2 existing, 3 partial, 4 absent** (one of the four,
ablation, is N/A rather than a gap, since nothing is promoted into scoring
yet). The strongest existing pattern across both lists is data-snooping/
curve-fitting control (`propose-weights.ts`'s guardrails) and honest
disclosure of unresolved confounds (the regime-vs-timeframe inversion is
published, not hidden) — the codebase's own established practice of saying
"nobody has measured this yet" rather than asserting a control that isn't
really there.

**Not attempted in this pass, and why:** permutation tests, block
bootstrap, multiple-testing correction, and confidence intervals are a
coherent piece of statistical-methodology work that belongs together (they
share the same "how much do we trust one attribution number" question) and
would need a real design — which resampling scheme, what significance
threshold, how it interacts with the existing `MIN_SAMPLES_PER_ARM` floor —
not a single afternoon's addition. A survivorship-safe, point-in-time
universe is a data-pipeline change (needs a delisted-symbol source GSPS
doesn't have today), not a backtest-harness one. These are named here as
the concrete next scope, should the project owner want to take them up as
their own initiative — matching how Q2's Monte Carlo/stress-test item is
already tracked rather than folded silently into an unrelated PR.

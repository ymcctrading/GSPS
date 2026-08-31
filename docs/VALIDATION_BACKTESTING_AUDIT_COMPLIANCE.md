# Validation, Backtesting, Audit & Compliance

Source: "Validation, Backtesting, Audit & Compliance Plan" implementation
spec, prepared for Claude Code, August 28, 2026 — draft implementation
directives; **requires securities/compliance counsel review before live
personalized recommendations or execution.** A disclaimer alone is not a
complete product-boundary solution, per the spec's own text.

Out-of-phase relative to `ROADMAP.md`: the full "Backtesting engine" item
(walk-forward testing, Monte Carlo simulation, parameter sensitivity) is
scheduled Q2. This lands the concrete, code-shaped pieces of the spec pack
now, by direct request, against the walk-forward harness that already
existed (`lib/backtest/*`, `docs/BACKTESTING.md`) rather than waiting for
Q2 to start it from zero. It does not close the Q2 item: Monte Carlo
simulation and the stress-test suite below are still open, and Q2 planning
should scope down to those plus parameter sensitivity, not restart the
metric/versioning work this PR adds.

## What already existed before this PR

`docs/BACKTESTING.md` is the fuller account; the spec pack's "Validation
before live use" checklist maps onto it almost item for item, which is why
this PR extends that harness instead of building a second one:

| Spec requirement | Where |
|---|---|
| Deterministic, versioned rule set, evaluated only on information available at signal time | `lib/backtest/replay.ts` replays the shipped `detectPatterns`/scoring functions bar by bar, never a re-implementation; daily context only reads sessions strictly before the day traded |
| Walk-forward testing; no repeated parameter selection on the same test sample | `lib/backtest/propose-weights.ts` — chronological (not shuffled) train/check split, a criterion must be `informative` and agree in sign on **both** halves, and the step size is capped by the weaker half |
| Model spread, commissions, slippage, gaps, partial fills | `ReplayOptions.costPerShare` (round-trip friction charged on every trade), ambiguous same-bar stop/target counted as a loss, gap rule and risk floor from `lib/strat/patterns.ts` |
| Report results by strategy, regime, sector, holding period | verdict bucket (`buckets`), large-cap split (`largeCapSplit`), ATR/stop-width bands (`atrBands`), per-criterion factor attribution (`factors`) |
| Distinguish actual from hypothetical/backtested; avoid cherry-picking | every `BacktestReport` carries `source`/`live`; `scripts/replay-report.mjs` **refuses to write a report from synthetic bars** (`refuseReason`) |
| Sample size and date range | `RunSummary.trades`/`window`; `attributeFactors` withholds a verdict below `MIN_SAMPLES_PER_ARM` (10) per arm |
| Out-of-sample results as primary evidence against overfitting | the propose-weights guardrails above; a proposal is written as a `draft` `learning_models` row and never auto-promoted to `live` |

## What this PR adds

The spec's "Required performance metrics" table listed several the harness
did not yet compute on its own: average/median win, average/median loss,
maximum loss, profit factor, maximum drawdown, and time-in-trade/exposure.

- **`lib/backtest/metrics.ts`** — `computeRequiredMetrics(trades)`, pure and
  unit-tested (`lib/backtest/__tests__/metrics.test.ts`) against a fixed
  trade list, same split as `attribution.ts`. Win/loss split is by
  `outcome`, not by the sign of `rMultiple` — matching every other count on
  this trade list (`replay.ts`'s own `summarise()`) — so a "win" that lost
  to friction stays a win rather than silently reclassifying. Max drawdown
  is peak-to-trough over the cumulative-R curve, trades sorted by
  `openedAt` first (`combine()` across symbols is not itself chronological).
- Every `RunSummary` (overall and each bucket) now carries a `required:
  RequiredMetrics` field — `lib/backtest/run.ts`, wired into `scripts/
  replay-report.mjs`'s rendered "Required performance metrics" table and
  `GET /api/backtest`'s JSON response. Old captured payloads (`--from`)
  that predate this render without the section rather than throwing.
- **Slippage sensitivity** — the one metric that needs a second full run
  rather than a derived number. `BacktestRequest.includeSlippageSensitivity`
  (CLI: `--slippageSensitivity`; API: `?slippageSensitivity=1`) reruns the
  same request at 3x `costPerShare` and reports the expectancy delta. Off by
  default: it doubles the vendor fetch cost of the request.
- **`lib/backtest/strategyVersion.ts`** — the spec's "freeze a strategy
  version before shadow/live-paper tracking." A manually bumped identifier
  (not a content hash, which would churn on refactors that change no rule),
  bumped whenever a change lands that could move backtest results — the
  same file list `docs/BACKTESTING.md`'s "So what does move the numbers"
  section already names. Every `BacktestReport` carries it, so a performance
  claim stays traceable to the exact rule set that produced it.

## What is not built here, and why

**Stress tests** (earnings gaps, broad-market selloffs, volatility spikes,
degraded liquidity) — the harness can already be pointed at a chosen window
via `--since`, and `atrBands`/`largeCapSplit` give a volatility/cap-size
slice of whatever window is run, but there is no dedicated stress-scenario
runner that selects *for* those conditions (e.g. "every earnings-week bar,"
"the top-decile ATR-expansion days"). Building one needs an event calendar
richer than the ~40-symbol earnings coverage `lib/macro/earnings.ts` has
today (see `docs/MARKET_UNIVERSE_DATA_QUALITY.md`'s coverage-gap note) —
left for the Q2 backtesting item rather than shipped against a coverage gap
that would make the results misleading.

**Monte Carlo simulation and formal parameter-sensitivity sweeps** — no
code here. `docs/BACKTESTING.md`'s propose-weights guardrails are the
project's answer to overfitting today; a Monte Carlo resampling layer over
the trade list is a real Q2 item, not a small addition to this PR.

**Full audit/explainability persistence** — the spec asks for immutable
records of input market-data snapshot/version, signal timestamp, strategy
version, rule values, component score, eligibility results, displayed
language, user actions, and imported execution results, plus an
explanation trace on every user-visible score and data lineage (source,
retrieval time, adjustment status, confidence/freshness). Pieces of this
already exist and are reused rather than duplicated:

- `computeScore`'s breakdown (`lib/scoring/score.ts`) already is a
  pass/fail/unknown explanation trace per criterion, surfaced to the replay
  via `ReplayTrade.criteria`.
- `lib/risk/audit.ts` already gives immutable-record treatment (timestamp,
  inputs, source-data confidence, notification/acknowledgement state) to
  circuit-breaker state changes, and `lib/promotion/config.ts` +
  `promotion_policy_change_log` already version policy thresholds with an
  audit trail.

What is genuinely missing is wiring a **live-scan-scoped** version of this
— persisting the market-data snapshot, strategy version, and displayed
copy actually shown to a user against each signal, and a lock/cooldown
override-attempt log — which touches the live scan pipeline and the
Supabase schema, not the backtest harness this PR extends. That is real,
separate work; scoping and building it belongs to whichever phase takes
up the audit-trail item explicitly, not folded silently into a backtesting
PR.

**Compliance and legal workstream** (product-boundary classification,
copy/claims review, privacy/security policy, incident/rollback procedure,
AI-governance language) — this is explicitly counsel's call per the spec
pack's own text, not something to implement in code. Nothing in this PR
should be read as satisfying it. `GSPS_DOCTRINE_ALIGNMENT_AUDIT.md` and
this repo's existing disclaimers are the current state; a compliance review
is unscheduled work, same as every other draft spec pack landed against
this codebase so far (`docs/MARKET_UNIVERSE_DATA_QUALITY.md`,
`docs/GSPS_TIER_ENTITLEMENT_SPEC.md`).

**Launch gates** — the spec's "Internal alpha" gate (deterministic signal
engine, audit logs, unit/integration tests, data freshness guardrails) is
substantially met by what already exists; "Closed beta" and beyond need the
notification/paper-trading-adherence/legal work tracked elsewhere in
`ROADMAP.md`, not by this PR.

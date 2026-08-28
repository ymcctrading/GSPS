# Signal and Regime Engine

Source: "GSPS Signal and Regime Engine" implementation spec, prepared for
Claude Code, August 28, 2026 — draft implementation directives; **requires
securities/compliance counsel review before use in live personalized
recommendations or execution.**

This is a new, separate decision layer from the existing Gann/STRAT scan
engine (`lib/strat`, `lib/scoring`, `lib/scan`), never merged into it. It is
out-of-phase relative to `ROADMAP.md`'s Q1 focus (notifications, analytics,
conditional orders); it was implemented directly against this spec, not
pulled from the roadmap.

## Where it's wired in

- **`lib/scanTicker.ts`** — every scan classifies the daily regime and, when
  it reads Trend, evaluates Trend Pullback and attaches the verdict as
  `ScanResult.signals`. This is a symbol-only scan with no account in scope,
  so account-only gates (sizing, correlation, cooldown, total open risk) are
  optimistic placeholders — see `lib/signals/scanGates.ts` and the
  `accountContextAssumed` flag on the verdict. `tradeable` here is a
  market-context reading, not an execution authorization.
- **Guided Decision Mode** (`lib/guided/service.ts`) — `Recommendation.why.signal`
  carries the same engine's rollup (regime/tier/tradeable, via
  `lib/signals/publicSummary.ts`) as informational context alongside the
  existing Execute/Watch verdict. It does not change eligibility, sizing, or
  which symbols become recommendations — see `lib/guided/eligibility.ts`,
  untouched.
- **Backtest** (`lib/backtest/replaySignals.ts`) — a historical walk-forward
  that tallies how often each regime/tier came up, for evidence-gathering
  ahead of any accuracy claim. Deliberately does not simulate trade outcomes
  (see that file's header for why).
- **Not yet wired**: chart overlay UI, notification/alert fan-out, and the
  scanner list UI. `lib/chart/signal-overlay.ts`'s `SignalOverlay` type is
  built around the existing engine's 0–9 score and shouldn't have this
  engine's 0–100 score force-fit into it; a proper UI surface for this
  engine's own verdict is follow-up work, not done here.

## What's implemented

- **Regime classifier** (`lib/signals/regime.ts`) — Trend / Range /
  Transition / Event-high-uncertainty, from independently designed public
  components: MA slope/alignment, ADX/DMI, ATR-based volatility, anchored
  VWAP, volume behavior, and horizontal support/resistance via swing-pivot
  clustering. A trend overlay (PSAR/Supertrend) is accepted only as
  optional evidence (`trendOverlayFlips`), never as a sole signal, per the
  spec.
- **Rules Alignment Score** (`lib/signals/scoring.ts`) — 0–100, tallied from
  a per-state weighted breakdown, sorted into internal readiness tiers (the
  weights and cutoffs are defined once in code — `lib/signals/scoring.ts`
  and each state module — and intentionally not restated here). Never
  rendered as a probability of profit — nothing in this module computes
  one.
- **Required disqualifiers** (`lib/signals/disqualifiers.ts`) — hard gates
  shared by all four states (stale/unclosed data, binary events, target/stop
  infeasibility, correlation/concentration/cooldown/total-open-risk,
  ineligible universe, bad data). Unknown event data defaults to block, per
  spec.
- **Trend Pullback** (`lib/signals/states/trendPullback.ts`) — the one state
  the spec gives a full v1 deterministic specification for ("Confirmed
  bullish pullback"). Implemented for both directions (the spec only writes
  out the bullish case; the bearish case is its structural mirror — lower
  high/low structure, resistance-side locations, close below the prior
  candle low). Primary Novice setup.

## What's scaffolded, not implemented

**Trend Breakout, Confirmed Reversal, and Range Reversion**
(`lib/signals/states/scaffold.ts`) are wired into the same architecture —
each is its own module and `ScannerStateMeta` entry, never merged into a
combined indicator — but each currently returns a `notImplemented` verdict.
The spec gives their regime table row (purpose, required characteristics,
disqualifiers) but, unlike Trend Pullback, does not give deterministic
entry/stop/target logic for any of them. Writing that logic in without a
spec would mean inventing exactly the kind of undocumented numeric rule this
doctrine-driven engine exists to avoid (see
`GSPS_DOCTRINE_ALIGNMENT_AUDIT.md` §4 on unvalidated methodology). Before
implementing them:

- **Trend Breakout** needs a base/compression definition (e.g. a
  volatility-contraction pattern and its measured boundaries) and an
  acceptance rule for the breakout (close-through vs. retest-and-hold).
- **Confirmed Reversal** needs the exhaustion criteria at a "meaningful
  location" made concrete (e.g. required extension in ATRs, or a specific
  divergence/failure-swing definition) and the structural break/reclaim
  threshold.
- **Range Reversion** needs the "verified rotational conditions" and
  boundary-touch count made concrete, plus the "no midpoint entries" rule's
  precise midpoint definition.

## Architecture notes

- Bars are `Bar[]` (`o/h/l/c/v`, ascending, closed only) — the shape the
  rest of `lib/strat`/`lib/scoring` use — not the chart-facing `Candle[]`
  shape in `lib/indicators.ts`.
- Account/context gates (liquidity, event calendar, portfolio risk) are
  supplied by the caller as `SignalGates`, the same pattern
  `lib/scoring/score.ts` uses for its own inputs — this module doesn't reach
  into `lib/scan`/`lib/guided` itself, so it stays independently testable.
- `lib/analysis/pivots.ts` (`atr`, `findPivots`, `clusterLevels`, `sma`) is
  reused rather than duplicated; `lib/signals/indicators.ts` adds only what
  didn't already exist there (ADX/DMI, anchored VWAP, relative volume, MA
  slope, SMA series).

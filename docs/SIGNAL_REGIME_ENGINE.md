# Signal and Regime Engine

Source: "GSPS Signal and Regime Engine" implementation spec, prepared for
Claude Code, August 28, 2026 — draft implementation directives; **requires
securities/compliance counsel review before use in live personalized
recommendations or execution.**

This is a new, separate decision layer from the existing Gann/STRAT scan
engine (`lib/strat`, `lib/scoring`, `lib/scan`). It is not wired into the
live scanner, notification, or Guided Decision Mode paths — it is a
standalone module (`lib/signals/`) that can be integrated once product/
compliance decide where and how its output should surface. This is
out-of-phase relative to `ROADMAP.md`'s Q1 focus (notifications, analytics,
conditional orders); it was implemented directly against this spec, not
pulled from the roadmap.

## What's implemented

- **Regime classifier** (`lib/signals/regime.ts`) — Trend / Range /
  Transition / Event-high-uncertainty, from independently designed public
  components: MA slope/alignment, ADX/DMI, ATR-based volatility, anchored
  VWAP, volume behavior, and horizontal support/resistance via swing-pivot
  clustering. A trend overlay (PSAR/Supertrend) is accepted only as
  optional evidence (`trendOverlayFlips`), never as a sole signal, per the
  spec.
- **Rules Alignment Score** (`lib/signals/scoring.ts`) — 0–100, tallied from
  a per-state weighted breakdown. Tier bands per spec: <75 watchlist only;
  75–84 qualified only if all safety gates pass; 85–91 A-tier; 92–100 A+.
  Never rendered as a probability of profit — nothing in this module
  computes one.
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

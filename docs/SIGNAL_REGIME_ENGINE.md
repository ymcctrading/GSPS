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

- **`lib/scanTicker.ts`** — every scan classifies the daily regime and
  evaluates all three implemented states: Trend Pullback when the regime
  reads Trend, and Trend Breakout / Confirmed Reversal unconditionally
  (both do their own price-action read of their precondition — a base, an
  exhaustion/break — rather than gating on the regime label; see
  `requiredRegime`'s doc comment in `lib/signals/types.ts`). All three
  verdicts attach to `ScanResult.signals`, independently — never merged
  into each other or into the Gann/STRAT verdict. This is a symbol-only
  scan with no account in scope, so account-only gates (sizing,
  correlation, cooldown, total open risk) are optimistic placeholders — see
  `lib/signals/scanGates.ts` and the `accountContextAssumed` flag on each
  verdict. `tradeable` here is a market-context reading, not an execution
  authorization.
- **Guided Decision Mode** (`lib/guided/service.ts`) — `Recommendation.why.signal`
  carries the strongest rollup across all three verdicts (tradeable first,
  then higher tier — see `toPublicSignalSummary` in
  `lib/signals/publicSummary.ts`) as informational context alongside the
  existing Execute/Watch verdict. It does not change eligibility, sizing,
  or which symbols become recommendations — see `lib/guided/eligibility.ts`,
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
- **Trend Breakout** (`lib/signals/states/trendBreakout.ts`) — unlike Trend
  Pullback, the spec gives this state only its regime-table row (purpose,
  Novice availability), not a deterministic entry/stop/target spec. This is
  therefore an **engineering-authored v1 spec, not spec-pack-sourced** —
  standard, publicly known breakout methodology (volatility contraction, a
  validated horizontal base with repeated boundary touches, a decisive close
  beyond it confirmed by volume expansion, a measured-move target), built in
  the same style and rigor as Trend Pullback but with thresholds this
  codebase chose, not doctrine-derived ones. Said so explicitly in that
  file's header rather than left implied. Picks the simpler of the two
  acceptance rules the first version of this doc left open (close-through,
  not retest-and-hold) — a retest variant is a reasonable v2 addition.
- **Confirmed Reversal** (`lib/signals/states/confirmedReversal.ts`) — same
  situation as Trend Breakout: the spec gives only the regime-table row
  ("exhaustion at a meaningful location plus structural break/reclaim";
  disqualifier "divergence or indicator flip without price confirmation"),
  not a deterministic spec. Another **engineering-authored v1 spec**, built
  from a standard, publicly known price-action technique — a failure-swing
  reversal: a fresh extreme, a decisive close back through the most recent
  opposing swing point, held for a second closed bar, with volume behind
  the break. The two-bar hold exists specifically to satisfy the spec's own
  disqualifier — nothing here scores off an oscillator reading alone, so a
  break that immediately fails back through the level (an "indicator flip"
  in price-only terms) can't read as confirmed. High-threshold state: every
  core criterion (exhaustion, break, hold, the exhaustion point staying
  intact, volume) is required outright to be tradeable, not just scored.

## What's scaffolded, not implemented

**Range Reversion** (`lib/signals/states/scaffold.ts`) is wired into the
same architecture — its own module, its own `ScannerStateMeta` entry, never
merged into a combined indicator — but currently returns a `notImplemented`
verdict. The spec gives its regime table row but no deterministic
entry/stop/target logic, and no obvious, standard, named technique to lean
on for an engineering-authored spec either the way breakout and failure-
swing-reversal methodology provided for the other two. Writing one in on
guesswork would mean inventing exactly the kind of undocumented numeric
rule this doctrine-driven engine exists to avoid (see
`GSPS_DOCTRINE_ALIGNMENT_AUDIT.md` §4 on unvalidated methodology). Before
implementing it, **Range Reversion** needs the "verified rotational
conditions" and boundary-touch count made concrete, plus the "no midpoint
entries" rule's precise midpoint definition.

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

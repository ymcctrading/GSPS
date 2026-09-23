# Strategy Modes

**Status:** Six modes live (2026-09-23). Custom-script/plugin system:
design-only, not built.

Strategy Modes is an opt-in, non-default system that generates entry, stop
loss, first target (TP1), and master target (MTP) from a named, real,
non-Gann trading technique — for a user who is actively trading that
technique and wants GSPS to price levels the way that technique would,
instead of (or alongside) GSPS's own Gann-grounded verdict.

See AGENTS.md's "Strategy Modes — scoped exception to the non-Gann boundary"
section for why this is allowed to exist at all: it is a deliberate,
narrow, project-owner-authorized exception to the "no non-Gann indicator may
feed an entry/stop/target" boundary that otherwise governs this codebase.
Read that section before touching anything under `lib/strategies/`.

## Hard rules (do not relax without new project-owner direction)

1. **Gann is always the default.** Every scan, the scorecard, `SignalGates`,
   the Automated Portfolio Manager, and plan-scoped Automation read only the
   existing Gann pipeline (`lib/gann/entryTrigger.ts`, `lib/strat/levels.ts`)
   unless a human explicitly picks a Strategy Mode for that one
   chart/ticket.
2. **One mode at a time.** Never combined, averaged, or silently persisted
   as an account-wide override of the Gann verdict.
3. **Never touches the scored criteria or `ScanResult.levels`.** A Strategy
   Mode result is a parallel, separately-labeled suggestion — the same kind
   of thing as a human typing a manual stop/target into the order ticket.
4. **Own math, not the display module's.** `lib/indicators.ts` is the
   chart-overlay family and its own header guarantees it never feeds a trade
   plan. Strategy Modes compute their own copies of shared formulas
   (`lib/strategies/math.ts`) so that guarantee stays literally true.
5. **Always labeled.** Every place a Strategy Mode result is shown states
   which mode produced it, so it can never be mistaken for the Gann trade
   plan.

## Architecture

```
lib/strategies/
  types.ts       StrategyModeId, StrategyLevels, StrategyEvaluator
  math.ts        Strategy-Modes-only indicator math (own copy, see rule 4)
  targets.ts     buildLevels() — shared R-multiple target projection
  registry.ts    mode id -> evaluator dispatch, isNonGannStrategyMode()
  psarSupertrend.ts
  saraStrat.ts
  maCrossover.ts
  bollinger.ts
  rsiReversal.ts
  macdMomentum.ts
```

Every mode exports a pure `(bars: Bar[]) => StrategyLevels | null` evaluator.
`bars` are closed bars, oldest-first — the same `Bar` shape (`lib/types.ts`)
every other engine in this codebase uses, so a mode can be evaluated against
whatever timeframe's bars the caller already has (5-minute for an intraday
mode, daily for a swing one) with no separate data path.

`null` is a real answer ("nothing armed on this bar"), not an error — same
convention `lib/gann/entryTrigger.ts` uses.

## The modes and why each was picked

Every mode below is designed through AGENTS.md's three-question mandate
(Gann sourcing, Dewey's cycle checklist, Hermetic framing) in its own module
header — summarized here, read the module for the full reasoning:

| Mode | Style | Entry | Stop | Targets |
|---|---|---|---|---|
| `psarSupertrend` | Intraday reversal | Break of the bar where PSAR + Supertrend both flip in agreement | Tighter of the two flipped indicator levels | 1.5R / 3R |
| `saraStrat` | Intraday/swing precision entry | STRAT bar-pattern's own trigger (`lib/strat/patterns.ts`) | Pattern's own stop | 1.5R / 3R |
| `maCrossover` | Swing trend-following | Break of the EMA9/SMA20 crossover bar | 10-bar swing low/high | 2R / 4R |
| `bollinger` | Swing mean-reversion | Break of a band-rejection bar | Rejection bar's own extreme | Middle band / opposite band |
| `rsiReversal` | Intraday/swing reversal | Break of the RSI 30/70 recross bar | That bar's own extreme | 1.5R / 3R |
| `macdMomentum` | Swing momentum | Break of the MACD histogram flip bar | 10-bar swing low/high | 2R / 4R |

`gann` is listed in `StrategyModeId` for completeness (a mode picker needs
to offer it as the default option) but has no evaluator in this registry —
it is the existing pipeline, not a new one.

## Why these six, and what's next

The project owner asked for PSAR+Supertrend and Sara Strat bar-pattern
levels specifically, then asked which other real swing/intraday
indicator-strategy combinations could reasonably be added given the
platform's existing indicator set (SMA20/50, EMA9, Bollinger(20,2), PSAR,
Supertrend, RSI14, MACD 12/26/9, plus STRAT patterns and structural levels).
MA crossover, Bollinger reversion, RSI reversal, and MACD momentum are the
four most standard, widely-taught strategies built directly on indicators
GSPS already computes — each is a real, commonly-traded technique, not an
invented one, matching the same "confirm the thesis before assuming it"
standard AGENTS.md's Three-question mandate and this feature's own request
applied to PSAR+Supertrend.

Candidates considered and deliberately not built this pass, for a future
session to pick up if requested:

- **VWAP-anchored reversion/breakout** — needs VWAP itself computed first;
  the Q2 "Expanded indicator library" roadmap item already lists "VWAP
  variants" as a charting candidate, so this mode should follow once that
  lands rather than duplicating the indicator's math ahead of it.
- **Stochastic %K/%D crossover** (intraday) and **Donchian channel
  breakout** (swing) — same shape as RSI reversal / Bollinger here, but both
  indicators are Q2 roadmap candidates, not yet implemented anywhere in this
  codebase; build the indicator first.
- **Volume-climax exhaustion reversal off PSAR/Supertrend** — combining a
  non-Gann trend overlay with `lib/gann/volumeClimax.ts` would blur the
  Gann/non-Gann line this document exists to keep clean; if wanted, it
  should compute its own volume-climax read rather than importing the Gann
  one.

## Custom-script / plugin system (design only — not built)

The project owner separately asked for a TradingView-style system: a user
(or GSPS) authors a new indicator/strategy, it plots on the chart, and it
can generate its own levels the same way the six modes above do. This is a
materially larger, security-sensitive project and was scoped as
design-only this session (explicit project-owner decision, 2026-09-23) —
recorded here so a future session has the shape rather than starting from
nothing, and so nobody mistakes the six built-in modes above for a
down-scoped version of this.

**Why it's larger than "add another mode":** the six modes above are code
GSPS's own engineers wrote and reviewed. A user-authored script is untrusted
code that must run against real market data and (optionally) feed an order
ticket — that combination is exactly what a sandbox exists to contain.

**Three-question framing, applied to the system itself rather than one
technique:**

1. *Gann grounding:* none, by design — this is explicitly the "bring your
   own method" system, the same carve-out the Q2 "Expanded indicator
   library" item already made for charting indicators, extended to
   full custom logic.
2. *Cycle theory:* not applicable to the platform mechanism itself — same
   answer `lib/gann/entryTrigger.ts` and this document's six modes give for
   a mechanism that claims no periodicity of its own. Applies per-script, if
   and when a specific script makes a periodicity claim.
3. *Hermetic principle: Polarity.* The novice/expert interface-design
   Polarity example in AGENTS.md's Three-question mandate section applies
   directly here — a script author is the "expert" pole of the same
   platform a novice trades on with Gann's default, and the two must
   coexist without either diluting the other. A custom script must never
   become visible as, or confusable with, GSPS's own verdict — the same
   labeling rule this document's six built-in modes already follow.

**Sketch of what building it would need** (not commitments, a starting
point):

- **A sandboxed execution environment** for user-submitted script code —
  most realistically a small declarative rule DSL (condition/action pairs
  over the same `Bar[]`/indicator-series primitives `lib/strategies/math.ts`
  already exposes) rather than an arbitrary-code sandbox, since a real JS/
  Python sandbox with network/filesystem isolation is a much larger security
  surface than this platform currently owns anywhere else. A DSL also
  composes naturally with the existing `StrategyEvaluator` interface — a
  compiled DSL script is just another function of that shape.
- **A plugin registry** — script metadata (author, name, version, the
  compiled rule), versioned so a script's own history is auditable the way
  `lib/backtest/strategyVersion.ts` versions a backtest strategy.
  A `strategy_plugins` table, parallel in spirit to migration 0048's
  `strategy_modules` (module identity queryable independent of a deploy —
  see AGENTS.md's orphan-module audit outcome 5/8 for that precedent and
  its "can never drift" lesson).
- **A chart-plotting hook** — reuse `components/chart/candles.tsx`'s
  existing overlay-series rendering path (the same one SMA/EMA/Bollinger/
  RSI/MACD/PSAR/Supertrend already use) rather than a new rendering system.
- **A level-generation hook** — any compiled script that emits
  entry/stop/target values must satisfy this document's five hard rules
  above exactly like the six built-in modes: opt-in, one-at-a-time, never
  touching the Gann verdict, own math, always labeled (by script name, not
  just "custom").
- **Backtesting a custom script** before trusting it live — reusing
  `lib/backtest/replaySignals.ts`'s evidence-gathering shape (parallel
  infrastructure to the Gann walk-forward replay, per AGENTS.md's orphan-
  module audit outcome 6/8) rather than a third backtest engine.

**Suggested sequencing** if/when this is picked up: DSL + evaluator
interface first (reuses everything in `lib/strategies/` unchanged), then the
plugin registry and chart hook, then backtesting, in that order — each
piece is independently useful and the DSL is required before either of the
others can exist.

Roadmap placement: Q2/Q3, alongside the existing "Expanded indicator
library for self-directed strategy testing" initiative (ROADMAP.md) — see
that document's entry for this feature.

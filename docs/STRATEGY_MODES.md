# Strategy Modes

**Status:** Nine modes live (2026-09-23, expanded same day). Tier-gated
(Novice: none; Pro: a four-mode subset; Expert/Wall Street: all). Custom-
script/plugin system: design-only, not built.

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
6. **Tier-gated, server-resolved only.** Which modes an account may even
   select is an entitlement (`lib/entitlements/policy.ts#allowedStrategyModes`),
   checked server-side on every read and write
   (`/api/strategy-levels`, `/api/strategy-mode-preference`) via
   `lib/strategies/access.ts#isStrategyModeAllowedForPolicy`. No client
   component computes or trusts its own idea of which modes a tier gets —
   each one renders exactly the list the server returns.

## Architecture

```
lib/strategies/
  types.ts       StrategyModeId, StrategyLevels, StrategyEvaluator
  math.ts        Strategy-Modes-only indicator math (own copy, see rule 4)
  targets.ts     buildLevels() — shared R-multiple target projection
  registry.ts    mode id -> evaluator dispatch, isNonGannStrategyMode()
  access.ts      isStrategyModeAllowedForPolicy() — tier gate (rule 6)
  psarSupertrend.ts
  saraStrat.ts
  maCrossover.ts
  bollinger.ts
  rsiReversal.ts
  macdMomentum.ts
  vwap.ts
  stochastic.ts
  donchian.ts
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
| `vwap` | Intraday reversal | Break of the session-VWAP reclaim/loss bar | That bar's own extreme | 1.5R / 3R |
| `stochastic` | Intraday/swing reversal | Break of the %K/%D cross-from-extreme bar | That bar's own extreme | 1.5R / 3R |
| `donchian` | Swing trend-following | Break beyond the 20-bar Donchian channel | Opposite channel bound | 2R / 4R |

`gann` is listed in `StrategyModeId` for completeness (a mode picker needs
to offer it as the default option) but has no evaluator in this registry —
it is the existing pipeline, not a new one.

## Tier gating (2026-09-23, direct project-owner instruction)

| Tier | Access |
|---|---|
| Novice (PRACTICE) | None — no selector shown, only the structural/Gann plan |
| Pro (STANDARD) | `macdMomentum`, `rsiReversal`, `maCrossover`, `vwap` only |
| Expert (INVESTOR_MODE) | All nine |
| Wall Street (SYSTEM_MASTERY) | All nine |

This is a pure access-control decision, not a claim about any technique, so
AGENTS.md's Three-question mandate questions 1 (Gann sourcing) and 2 (Dewey's
cycle checklist) don't apply to the gating itself — each *mode* still answers
them individually in its own module header. Question 3 (Hermetic principle)
does apply: this reads as **Polarity**, the same framing AGENTS.md's mandate
section gives the novice/expert interface-design goal — a four-tier ladder
that widens what each tier is trusted to touch, rather than either exposing
everything to everyone or reserving all depth for the top tier. Pro's four
modes were chosen as the ones built directly on indicators Pro can already
see on the chart today (MACD, RSI, EMA/SMA); the five held back for Expert/
Wall Street are the two precision-entry reversal modes GSPS's own case study
built first (PSAR+Supertrend, Sara Strat) plus the newer Bollinger,
Stochastic, and Donchian modes.

## Why these nine, and what's next

The project owner asked for PSAR+Supertrend and Sara Strat bar-pattern
levels specifically, then asked which other real swing/intraday
indicator-strategy combinations could reasonably be added given the
platform's existing indicator set (SMA20/50, EMA9, Bollinger(20,2), PSAR,
Supertrend, RSI14, MACD 12/26/9, plus STRAT patterns and structural levels).
MA crossover, Bollinger reversion, RSI reversal, and MACD momentum were the
first four follow-ons — the most standard, widely-taught strategies built
directly on indicators GSPS already computed at the time. VWAP reclaim/loss,
Stochastic crossover, and Donchian breakout were picked up the same day as a
direct follow-up request, closing out every candidate this document had
originally deferred (see the retired list below). Every mode here is a
real, commonly-traded technique, not an invented one, matching the same
"confirm the thesis before assuming it" standard AGENTS.md's Three-question
mandate and this feature's own original request applied to PSAR+Supertrend.

**Retired deferred-candidate list** (all three built 2026-09-23; kept here
only so a future session doesn't waste time re-deriving why they were once
deferred): VWAP-anchored reversion (needed VWAP computed first — now
`lib/strategies/math.ts#vwap`, a session-anchored cumulative VWAP built for
Strategy Modes' own use, independent of the Q2 "Expanded indicator library"
charting item, which may still add VWAP as a chart overlay separately);
Stochastic %K/%D crossover and Donchian channel breakout (both needed their
indicator built first — now `lib/strategies/math.ts#stochastic`/`#donchian`).

One candidate remains deliberately not built:

- **Volume-climax exhaustion reversal off PSAR/Supertrend** — combining a
  non-Gann trend overlay with `lib/gann/volumeClimax.ts` would blur the
  Gann/non-Gann line this document exists to keep clean; if wanted, it
  should compute its own volume-climax read rather than importing the Gann
  one.

## Custom-script / plugin system

**Status (2026-09-23): Phases 1-2 (DSL + evaluator, plugin registry + CRUD
API) built and tested. Phases 3-4 (chart-plotting hook, backtesting) remain
design-only**, per the sequencing below — this section was originally
written as design-only and is updated in place rather than duplicated.

The project owner separately asked for a TradingView-style system: a user
(or GSPS) authors a new indicator/strategy, it plots on the chart, and it
can generate its own levels the same way the nine modes above do. This is a
materially larger, security-sensitive project than the nine built-in modes
— recorded here so a future session has the shape rather than starting from
nothing, and so nobody mistakes the nine built-in modes above for a
down-scoped version of this.

**Why it's larger than "add another mode":** the nine modes above are code
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
   answer `lib/gann/entryTrigger.ts` and this document's nine modes give for
   a mechanism that claims no periodicity of its own. Applies per-script, if
   and when a specific script makes a periodicity claim.
3. *Hermetic principle: Polarity.* The novice/expert interface-design
   Polarity example in AGENTS.md's Three-question mandate section applies
   directly here — a script author is the "expert" pole of the same
   platform a novice trades on with Gann's default, and the two must
   coexist without either diluting the other. A custom script must never
   become visible as, or confusable with, GSPS's own verdict — the same
   labeling rule this document's nine built-in modes already follow.

### Phase 1 — DSL + evaluator (built 2026-09-23)

`lib/strategies/custom/` — a small, safe, declarative condition/action rule
DSL over `Bar[]` and the same indicator primitives `lib/strategies/math.ts`
exposes to the nine built-in modes (`sma`, `ema`, `rsi`, `atr`, `vwap`,
`macd`, `bollinger`, `psar`, `supertrend`, `stochastic`, plus a
`lowest`/`highest` swing-lookback primitive mirroring `recentLow`/
`recentHigh`), compiled to a function of the exact `(bars: Bar[]) =>
X | null` shape `lib/strategies/types.ts#StrategyEvaluator` already uses.
Deliberately **not** an arbitrary-code sandbox — no `eval`, `new Function`,
or `vm`, anywhere — the design-only sketch below explained why that tradeoff
was chosen, and Phase 1 built exactly that, not a more general sandbox.

- `lexer.ts` / `parser.ts` — hand-written recursive-descent parser, text ->
  AST. Every production emits exactly one whitelisted node kind
  (`types.ts`); an unrecognized identifier, out-of-range parameter, or
  oversized/too-deep tree is a parse error, never a best-effort guess.
  Grammar: `rule bullish|bearish when <condition> { entry = <expr> stop =
  <expr> tp1r = <n> mtpr = <n> }`, condition supports comparisons,
  `crossesAbove`/`crossesBelow`, `and`/`or`/`not`; expressions support bar
  series (`close[1]` = one bar back), indicator calls with an optional
  `.field` and offset, and `+ - * /`.
- `limits.ts` — bounds enforced at parse time: max source length, AST node
  count, expression nesting depth, indicator period/offset. There is no
  loop or recursion in the language itself, so runtime cost per evaluated
  bar is a fixed function of the (bounded) AST size; the only
  `bars.length`-scaled work is computing each distinct indicator series
  once per call (`interpret.ts`'s cache), identical to how a built-in mode
  like `maCrossover.ts` calls `ema()`/`sma()` once.
- `interpret.ts` — tree-walking interpreter, AST -> evaluator. Purely a
  function of `bars` (every `math.ts` function is deterministic, nothing
  reads the clock or randomness), so the same input always produces the
  same output.
- `types.ts` — `CustomScriptLevels`, deliberately **not** folded into
  `StrategyLevels`/`StrategyModeId` (a closed union the nine built-ins and
  `registry.ts`'s dispatch table depend on staying closed). Carries
  `scriptId`/`scriptName`/`author`/`version` instead of a `mode` field —
  satisfies hard rule 5 ("always labeled by the script's own name/author")
  structurally, not by convention.
- `compile.ts` — the single entry point (`compileCustomScript(source,
  identity)`) later phases should call rather than using the parser/
  interpreter directly.

Verified: 22 unit tests (`__tests__/customScript.test.ts`) — grammar/
whitelist/bounds rejection cases, and exact numeric parity against
`evaluateMaCrossover` for a hand-written DSL rule expressing the identical
EMA9/SMA20 crossover logic. `tsc --noEmit`, lint, and
`check-banned-terms.mjs` all clean.

**Design decisions confirmed with the project owner before building**
(2026-09-23), reasoned through the Three-question mandate rather than
engineering preference alone — full reasoning in AGENTS.md's "Custom-
script/plugin system" entry:
- **A textual grammar, not a JSON-only AST**, for Hermetic Correspondence —
  the text an author writes is a direct, legible mirror of the AST the
  interpreter walks, not an opaque encoding an author would have to hand-
  construct.
- **Script authoring: Wall Street-tier only** (Q1's existing "all nine
  built-in modes" tier, one rung up — authoring is categorically more
  sensitive than selecting a pre-vetted built-in mode).
- **Private to the authoring user only in v1, no marketplace/shared
  scripts.** A GSPS-curated script would be trusted code (GSPS wrote it),
  so it belongs in the existing built-in-mode pipeline (as a tenth, eleventh,
  ... mode) rather than routed through the untrusted-script system; a
  shared *user* script reopens the "one user's code runs for another user"
  trust problem this scoping exists to avoid. Read through Polarity: a
  script author trades their own method, they do not get to issue verdicts
  to other users.

### Phase 2 — plugin registry + CRUD API (built 2026-09-23)

- **`supabase/migrations/0080_strategy_plugins.sql`** — `strategy_plugins`
  (one row per script: `user_id`, `name`, `author`, `source`, `version`,
  `active`; owner-only RLS, unique on `(user_id, name)`) and
  `strategy_plugin_versions` (append-only: one row per saved `source` edit,
  `unique (plugin_id, version)`, RLS resolved through the parent plugin's
  `user_id` rather than a direct FK to `auth.users` — same reasoning 0048's
  evaluation tables use for `signal_id`). Parallel in spirit to migration
  0048's `strategy_modules` (module identity queryable independent of a
  deploy — AGENTS.md's orphan-module audit outcome 5/8), but its "can never
  drift" property is enforced differently: no compiled-AST or evaluator
  column exists to drift from `source` in the first place, because every
  read path recompiles `source` through `compileCustomScript` on demand
  rather than trusting a cached derivative.
- **`/api/strategy-plugins`** (list, create) and
  **`/api/strategy-plugins/[id]`** (read + version history, edit, delete).
  Every write resolves `isCustomScriptAuthoringAllowedForPolicy` server-side
  (Wall Street tier only —
  `lib/entitlements/policy.ts#customScriptAuthoringEnabled`) and compiles
  `source` through `compileCustomScript` before persisting; a script that
  fails to compile is rejected with the parser's own error message and
  never stored. Every query is additionally scoped to `user_id = auth
  user`, matching the private-to-author-only decision (RLS enforces the
  same boundary independently). Editing `source` bumps `version` and
  appends a `strategy_plugin_versions` row; editing `name`/`active` alone
  does not, since those aren't the script's logic.

### Phases 3-4 — not yet built

- **A chart-plotting hook** — reuse `components/chart/candles.tsx`'s
  existing overlay-series rendering path (the same one SMA/EMA/Bollinger/
  RSI/MACD/PSAR/Supertrend already use) rather than a new rendering system.
- **A level-generation hook** wiring `compileCustomScript`'s output into the
  order ticket's optional levels display — must satisfy this document's six
  hard rules exactly like the nine built-in modes and Phase 1's
  `CustomScriptLevels` already does structurally: opt-in, one-at-a-time,
  never touching the Gann verdict, own math, always labeled, tier-gated and
  server-resolved.
- **Backtesting a custom script** before trusting it live — reusing
  `lib/backtest/replaySignals.ts`'s evidence-gathering shape (parallel
  infrastructure to the Gann walk-forward replay, per AGENTS.md's orphan-
  module audit outcome 6/8) rather than a third backtest engine.

Roadmap placement: Q2/Q3, alongside the existing "Expanded indicator
library for self-directed strategy testing" initiative (ROADMAP.md) — see
that document's entry for this feature.

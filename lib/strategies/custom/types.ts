/**
 * Custom-script Strategy Modes — AST and result types for the DSL described
 * in `docs/STRATEGY_MODES.md`'s "Custom-script / plugin system" section.
 *
 * This is Phase 1 of that design sketch: a small declarative rule language
 * (condition/action pairs over `Bar[]` and the same indicator primitives
 * `lib/strategies/math.ts` exposes to the nine built-in modes) compiled to a
 * function of the exact shape `lib/strategies/types.ts#StrategyEvaluator`
 * already uses — `(bars: Bar[]) => X | null` — so a compiled script behaves
 * like a tenth mode at the evaluation boundary without widening
 * `StrategyModeId`, which is a closed union the nine built-ins and
 * `lib/strategies/registry.ts`'s dispatch table both rely on staying closed.
 *
 * Three-question design basis (AGENTS.md's Three-question mandate), applied
 * to the DSL/evaluator mechanism itself rather than any one script:
 * 1. Gann grounding: none, by design — this is deliberately the "bring your
 *    own method" system `docs/STRATEGY_MODES.md` already scoped it as, the
 *    same answer every one of the nine built-in modes gives.
 * 2. Cycle theory: not applicable to the mechanism itself, which claims no
 *    periodicity of its own (same answer `lib/gann/entryTrigger.ts` and the
 *    nine built-in modes give). Applies per-script if a specific script's
 *    condition makes a periodicity claim — that is between the script author
 *    and their own technique, not this interpreter.
 * 3. Hermetic principle: two, at two different points in this system's
 *    design, not one. `docs/STRATEGY_MODES.md` already frames the custom-
 *    script system as a whole through **Polarity** — a script author is the
 *    "expert" pole of the same platform a novice trades on with Gann's
 *    default, and the two must coexist without either diluting the other
 *    (hence: opt-in, one-at-a-time, always labeled, never touching the Gann
 *    verdict — identical to the nine built-in modes' own rules). Separately,
 *    the choice of *representation* for the DSL itself (a small textual
 *    grammar in `parser.ts`, rather than requiring an author to hand-write a
 *    JSON tree) is **Correspondence** ("as above, so below") — the text an
 *    author writes is a direct, legible mirror of the AST the interpreter
 *    walks, not an opaque encoding of it. Every grammar production in
 *    `parser.ts` maps to exactly one node kind below; there is no surface
 *    syntax that doesn't correspond 1:1 to a structural type here. Keeping
 *    that correspondence exact is also what keeps the parser safe: it only
 *    ever emits nodes from this closed set, never arbitrary computation.
 */

import type { Bar } from "@/lib/types";
import type { StrategyDirection } from "../types";

// ---------------------------------------------------------------------------
// Numeric expressions
// ---------------------------------------------------------------------------

export type BarSeriesName = "open" | "high" | "low" | "close" | "volume";

/** Indicator functions a script may reference — exactly the whitelist
 * `lib/strategies/math.ts` exposes to the built-in modes. Nothing else is a
 * valid identifier in this grammar (see `parser.ts`'s `INDICATOR_SPECS`). */
export type IndicatorFn =
  | "sma"
  | "ema"
  | "rsi"
  | "atr"
  | "vwap"
  | "macd"
  | "bollinger"
  | "psar"
  | "supertrend"
  | "stochastic";

export type NumExpr =
  | { kind: "num"; value: number }
  | { kind: "series"; series: BarSeriesName; offset: number }
  | { kind: "indicator"; fn: IndicatorFn; params: number[]; field: string | null; offset: number }
  /** `lowest(low, N)` / `highest(high, N)` — the same trailing-swing
   * reference `lib/strategies/math.ts#recentLow`/`#recentHigh` gives the
   * built-in modes, restricted to the bar's own low/high series (the only
   * inputs those two functions accept). */
  | { kind: "extreme"; fn: "lowest" | "highest"; series: "low" | "high"; lookback: number; offset: number }
  | { kind: "neg"; expr: NumExpr }
  | { kind: "binary"; op: "+" | "-" | "*" | "/"; left: NumExpr; right: NumExpr };

// ---------------------------------------------------------------------------
// Boolean (condition) expressions
// ---------------------------------------------------------------------------

export type CompareOp = ">" | "<" | ">=" | "<=" | "==" | "!=";

export type BoolExpr =
  | { kind: "compare"; op: CompareOp; left: NumExpr; right: NumExpr }
  | { kind: "cross"; direction: "above" | "below"; a: NumExpr; b: NumExpr }
  | { kind: "and"; left: BoolExpr; right: BoolExpr }
  | { kind: "or"; left: BoolExpr; right: BoolExpr }
  | { kind: "not"; expr: BoolExpr };

// ---------------------------------------------------------------------------
// Rule / script
// ---------------------------------------------------------------------------

export interface CustomScriptRule {
  direction: StrategyDirection;
  condition: BoolExpr;
  entry: NumExpr;
  stopLoss: NumExpr;
  /** R-multiple targets — same shared shape `lib/strategies/targets.ts#buildLevels`
   * uses for every built-in mode. Defaults applied by the parser when omitted
   * (1.5R / 3R, matching the majority of the nine built-in modes). */
  tp1R: number;
  mtpR: number;
}

/** A compiled script's AST: at most one bullish and one bearish rule, same
 * as every built-in mode's own bullish/bearish branch shape (see
 * `maCrossover.ts` for the pattern this mirrors). At least one must be
 * present. */
export interface CustomScriptAst {
  bullish: CustomScriptRule | null;
  bearish: CustomScriptRule | null;
}

// ---------------------------------------------------------------------------
// Evaluation result — deliberately NOT `StrategyLevels`/`StrategyModeId`.
// ---------------------------------------------------------------------------

/**
 * A compiled script's output. Structurally parallel to
 * `lib/strategies/types.ts#StrategyLevels` (same five level fields) but
 * carries the script's own identity instead of a `StrategyModeId`, per hard
 * rule 5 ("always labeled by the script's own name/author, not a generic
 * 'custom' label") — `StrategyModeId` is a closed union the built-in
 * registry dispatches on and must not be widened for user content.
 */
export interface CustomScriptLevels {
  scriptId: string;
  scriptName: string;
  author: string;
  version: number;
  direction: StrategyDirection;
  entry: number;
  stopLoss: number;
  takeProfit1: number;
  masterTarget: number;
  riskPerShare: number;
  rationale: string;
}

/** Same shape as `lib/strategies/types.ts#StrategyEvaluator`
 * (`(bars: Bar[]) => X | null`) so a compiled script behaves identically to a
 * built-in mode at every call site, just over the parallel result type
 * above. */
export type CompiledScriptEvaluator = (bars: Bar[]) => CustomScriptLevels | null;

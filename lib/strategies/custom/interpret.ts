/**
 * Interpreter: `CustomScriptAst` -> `CompiledScriptEvaluator`
 * (`(bars: Bar[]) => CustomScriptLevels | null`).
 *
 * This is a tree-walking interpreter over data the parser already validated
 * against a closed whitelist (`parser.ts#INDICATOR_SPECS`,
 * `BAR_SERIES_NAMES`) — there is no `eval`, no `new Function`, no dynamic
 * property access driven by user input, and no loop or recursion in the
 * language itself, so evaluation cost for one bar index is a fixed function
 * of the AST's (bounded) size. The only per-call work that scales with
 * `bars.length` is computing each distinct indicator series once (via
 * `lib/strategies/math.ts`, the same functions the nine built-in modes use)
 * and caching it for the rest of that call — identical to how a built-in
 * mode like `maCrossover.ts` calls `ema()`/`sma()` once per evaluation.
 *
 * Determinism: every `lib/strategies/math.ts` function is a pure function of
 * `bars`, and nothing in this interpreter reads the clock, randomness, or any
 * external state — the same `bars` array always produces the same result.
 */

import type { Bar } from "@/lib/types";
import * as math from "../math";
import type {
  BoolExpr,
  CompiledScriptEvaluator,
  CustomScriptAst,
  CustomScriptLevels,
  CustomScriptRule,
  NumExpr,
} from "./types";

// Every `lib/strategies/math.ts` indicator returns either a `(number | null)[]`
// or a `(SomePoint | null)[]` where `SomePoint` is a plain object of numeric
// fields — `unknown` here is narrowed defensively at each read site below
// rather than trying to union every concrete point type math.ts exports.
type IndicatorArray = readonly unknown[];

function computeIndicatorArray(fn: string, params: number[], bars: Bar[]): IndicatorArray {
  switch (fn) {
    case "sma":
      return math.sma(bars, params[0]);
    case "ema":
      return math.ema(bars, params[0]);
    case "rsi":
      return math.rsi(bars, params[0]);
    case "atr":
      return math.atr(bars, params[0]);
    case "vwap":
      return math.vwap(bars);
    case "macd":
      return math.macd(bars, params[0], params[1], params[2]);
    case "bollinger":
      return math.bollinger(bars, params[0], params[1]);
    case "psar":
      return math.psar(bars, params[0], params[1]);
    case "supertrend":
      return math.supertrend(bars, params[0], params[1]);
    case "stochastic":
      return math.stochastic(bars, params[0], params[1], params[2]);
    default:
      // Unreachable: the parser only ever emits `fn` values from
      // `INDICATOR_SPECS`, which is exactly this switch's case list.
      throw new Error(`Unknown indicator function '${fn}'`);
  }
}

const SERIES_FIELD: Record<string, keyof Bar> = {
  open: "o",
  high: "h",
  low: "l",
  close: "c",
  volume: "v",
};

class EvalContext {
  private indicatorCache = new Map<string, IndicatorArray>();

  constructor(private bars: Bar[]) {}

  private indicatorArray(fn: string, params: number[]): IndicatorArray {
    const key = `${fn}(${params.join(",")})`;
    let arr = this.indicatorCache.get(key);
    if (!arr) {
      arr = computeIndicatorArray(fn, params, this.bars);
      this.indicatorCache.set(key, arr);
    }
    return arr;
  }

  num(node: NumExpr, i: number): number | null {
    switch (node.kind) {
      case "num":
        return node.value;

      case "series": {
        const idx = i - node.offset;
        if (idx < 0 || idx >= this.bars.length) return null;
        return this.bars[idx][SERIES_FIELD[node.series]] as number;
      }

      case "extreme": {
        const idx = i - node.offset;
        if (idx < 0 || idx >= this.bars.length) return null;
        return node.fn === "lowest"
          ? math.recentLow(this.bars, idx, node.lookback)
          : math.recentHigh(this.bars, idx, node.lookback);
      }

      case "indicator": {
        const idx = i - node.offset;
        const arr = this.indicatorArray(node.fn, node.params);
        if (idx < 0 || idx >= arr.length) return null;
        const point = arr[idx];
        if (point == null) return null;
        if (typeof point === "number") return point;
        if (!node.field) return null;
        const value = (point as Record<string, unknown>)[node.field];
        return typeof value === "number" ? value : null;
      }

      case "neg": {
        const v = this.num(node.expr, i);
        return v == null ? null : -v;
      }

      case "binary": {
        const l = this.num(node.left, i);
        const r = this.num(node.right, i);
        if (l == null || r == null) return null;
        switch (node.op) {
          case "+":
            return l + r;
          case "-":
            return l - r;
          case "*":
            return l * r;
          case "/":
            return r === 0 ? null : l / r;
        }
      }
    }
  }

  bool(node: BoolExpr, i: number): boolean {
    switch (node.kind) {
      case "compare": {
        const l = this.num(node.left, i);
        const r = this.num(node.right, i);
        if (l == null || r == null) return false;
        switch (node.op) {
          case ">":
            return l > r;
          case "<":
            return l < r;
          case ">=":
            return l >= r;
          case "<=":
            return l <= r;
          case "==":
            return l === r;
          case "!=":
            return l !== r;
        }
        break;
      }

      case "cross": {
        if (i < 1) return false;
        const aNow = this.num(node.a, i);
        const bNow = this.num(node.b, i);
        const aPrev = this.num(node.a, i - 1);
        const bPrev = this.num(node.b, i - 1);
        if (aNow == null || bNow == null || aPrev == null || bPrev == null) return false;
        return node.direction === "above"
          ? aPrev <= bPrev && aNow > bNow
          : aPrev >= bPrev && aNow < bNow;
      }

      case "and":
        return this.bool(node.left, i) && this.bool(node.right, i);

      case "or":
        return this.bool(node.left, i) || this.bool(node.right, i);

      case "not":
        return !this.bool(node.expr, i);
    }
  }
}

function evaluateRule(
  rule: CustomScriptRule,
  ctx: EvalContext,
  i: number,
  identity: { scriptId: string; scriptName: string; author: string; version: number },
): CustomScriptLevels | null {
  if (!ctx.bool(rule.condition, i)) return null;

  const entry = ctx.num(rule.entry, i);
  const stopLoss = ctx.num(rule.stopLoss, i);
  if (entry == null || stopLoss == null) return null;

  const dir = rule.direction === "bullish" ? 1 : -1;
  const riskPerShare = Math.abs(entry - stopLoss);
  // Same guard `lib/strategies/targets.ts#buildLevels` applies to every
  // built-in mode: a trigger on the wrong side of its own stop, or with
  // ~zero risk, is not a real setup.
  if (riskPerShare <= 0 || dir * (entry - stopLoss) <= 0) return null;

  return {
    ...identity,
    direction: rule.direction,
    entry,
    stopLoss,
    takeProfit1: entry + dir * rule.tp1R * riskPerShare,
    masterTarget: entry + dir * rule.mtpR * riskPerShare,
    riskPerShare,
    rationale: `'${identity.scriptName}' by ${identity.author}: ${rule.direction} rule condition met.`,
  };
}

export interface ScriptIdentity {
  scriptId: string;
  scriptName: string;
  author: string;
  version: number;
}

/** Compile a validated AST into an evaluator matching
 * `lib/strategies/types.ts#StrategyEvaluator`'s `(bars) => X | null` shape.
 * `null` is a real answer ("nothing armed on this bar"), the same convention
 * every built-in mode and `lib/gann/entryTrigger.ts` use. */
export function interpret(ast: CustomScriptAst, identity: ScriptIdentity): CompiledScriptEvaluator {
  return (bars: Bar[]): CustomScriptLevels | null => {
    if (bars.length < 2) return null;
    const ctx = new EvalContext(bars);
    const i = bars.length - 1;

    if (ast.bullish) {
      const result = evaluateRule(ast.bullish, ctx, i, identity);
      if (result) return result;
    }
    if (ast.bearish) {
      const result = evaluateRule(ast.bearish, ctx, i, identity);
      if (result) return result;
    }
    return null;
  };
}

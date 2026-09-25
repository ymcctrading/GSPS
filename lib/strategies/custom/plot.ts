/**
 * Extracts the named indicator/extreme series a compiled script references,
 * so Phase 3's chart hook can plot them the same way the platform already
 * plots SMA/EMA/Bollinger/PSAR/Supertrend — reusing
 * `components/chart/candles.tsx`'s existing overlay-series rendering path
 * rather than building a second one (`docs/STRATEGY_MODES.md`'s own
 * sequencing note for this phase).
 *
 * Only named indicator/extreme references are plotted — bare bar series
 * (`open`/`high`/`low`/`close`/`volume`) are skipped because the candles
 * already show OHLC, and compound arithmetic (`+`/`-`/`*`/`/`) is walked
 * into rather than plotted as one synthetic line, so a script referencing
 * `ema(9) - sma(20)` plots the two named indicators it's built from, not an
 * unlabeled difference series — consistent with every built-in overlay
 * being a single, clearly-named technique.
 */

import type { Bar } from "@/lib/types";
import { EvalContext } from "./interpret";
import type { BoolExpr, CustomScriptAst, CustomScriptRule, NumExpr } from "./types";

export interface PlotSeries {
  /** Stable, human-readable label — e.g. "ema(9)", "macd(12,26,9).histogram",
   * "lowest(low,10)". Doubles as the dedup key: two references to the same
   * indicator/params/field plot as one line, regardless of offset. */
  label: string;
  points: (number | null)[];
}

/**
 * The dedup key doubles as the plotted label, and the returned node is
 * always normalized to `offset: 0` — a script may reference the same
 * indicator at several offsets (e.g. `ema(9)` and `ema(9)[1]` in the same
 * condition), but the *plotted line* is always the whole, unshifted series;
 * only the offset actually used at evaluation time (in `interpret.ts`)
 * should ever shift which bar a value is read from.
 */
function plotKeyAndNode(node: NumExpr): { key: string; node: NumExpr } | null {
  switch (node.kind) {
    case "indicator": {
      const field = node.field ? `.${node.field}` : "";
      const key = `${node.fn}(${node.params.join(",")})${field}`;
      return { key, node: { ...node, offset: 0 } };
    }
    case "extreme": {
      const key = `${node.fn}(${node.series},${node.lookback})`;
      return { key, node: { ...node, offset: 0 } };
    }
    default:
      return null;
  }
}

function collectNumNodes(node: NumExpr, out: Map<string, NumExpr>): void {
  const found = plotKeyAndNode(node);
  if (found && !out.has(found.key)) out.set(found.key, found.node);

  switch (node.kind) {
    case "neg":
      collectNumNodes(node.expr, out);
      break;
    case "binary":
      collectNumNodes(node.left, out);
      collectNumNodes(node.right, out);
      break;
    default:
      break;
  }
}

function collectBoolNodes(node: BoolExpr, out: Map<string, NumExpr>): void {
  switch (node.kind) {
    case "compare":
      collectNumNodes(node.left, out);
      collectNumNodes(node.right, out);
      break;
    case "cross":
      collectNumNodes(node.a, out);
      collectNumNodes(node.b, out);
      break;
    case "and":
    case "or":
      collectBoolNodes(node.left, out);
      collectBoolNodes(node.right, out);
      break;
    case "not":
      collectBoolNodes(node.expr, out);
      break;
  }
}

function collectRuleNodes(rule: CustomScriptRule, out: Map<string, NumExpr>): void {
  collectBoolNodes(rule.condition, out);
  collectNumNodes(rule.entry, out);
  collectNumNodes(rule.stopLoss, out);
}

/** Every distinct indicator/extreme reference across both rule blocks,
 * keyed by `plotKey` so a script referencing the same indicator twice (e.g.
 * in both its bullish and bearish condition) plots once. */
export function collectPlotNodes(ast: CustomScriptAst): Map<string, NumExpr> {
  const out = new Map<string, NumExpr>();
  if (ast.bullish) collectRuleNodes(ast.bullish, out);
  if (ast.bearish) collectRuleNodes(ast.bearish, out);
  return out;
}

/** Computes each referenced indicator/extreme series across every bar, for
 * chart display. Reuses `EvalContext`'s own indicator cache, so a series
 * referenced at multiple offsets is still computed once. */
export function computeScriptPlotSeries(ast: CustomScriptAst, bars: Bar[]): PlotSeries[] {
  const nodes = collectPlotNodes(ast);
  const ctx = new EvalContext(bars);
  return Array.from(nodes.entries()).map(([label, node]) => ({
    label,
    points: bars.map((_, i) => ctx.num(node, i)),
  }));
}

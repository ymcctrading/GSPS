/**
 * Explain-the-math for a user's custom script (see ./types.ts). The script
 * explains GSPS's plan through the indicators it already names, so authors
 * write nothing new: price-scale lines (averages, bands, VWAP, PSAR,
 * Supertrend, trailing highs and lows) are compared with each plan level (only
 * the nearest one on either side of it), and
 * oscillators (RSI, MACD, stochastic, ATR) are read at a hypothetical close on
 * each level. The script's own rules decide its lean: whichever rule fires on
 * the latest bar. Its `entry`/`stop`/`tp1r`/`mtpr` lines are not read here.
 */

import type { Bar } from "@/lib/types";
import { computeScriptPlotSeries } from "../custom/plot";
import type { CompiledScriptEvaluator, CustomScriptAst } from "../custom/types";
import {
  distanceWords,
  fixed,
  latestAtr,
  money,
  readEachLevel,
  reading,
  withHypotheticalClose,
} from "./common";
import type { PlanInput, PlanReading } from "./types";

const OSCILLATOR_PREFIXES = ["rsi(", "macd(", "stochastic(", "atr("];

function isOscillator(label: string): boolean {
  return OSCILLATOR_PREFIXES.some((p) => label.startsWith(p));
}

const MAX_OSCILLATORS_PER_LEVEL = 2;

type Line = { label: string; value: number };

/** The nearest line at or above `price` and the nearest below it. */
function nearestLines(lines: Line[], price: number): Line[] {
  let above: Line | null = null;
  let below: Line | null = null;
  for (const l of lines) {
    if (l.value >= price) {
      if (!above || l.value < above.value) above = l;
    } else if (!below || l.value > below.value) below = l;
  }
  return [below, above].filter((l): l is Line => l != null);
}

function lastValue(points: (number | null)[]): number | null {
  for (let i = points.length - 1; i >= 0; i--)
    if (points[i] != null) return points[i];
  return null;
}

export function explainCustomScript(
  script: { id: string; name: string },
  ast: CustomScriptAst,
  evaluator: CompiledScriptEvaluator,
  bars: Bar[],
  plan: PlanInput,
): PlanReading | null {
  if (bars.length === 0) return null;
  const series = computeScriptPlotSeries(ast, bars);
  const now = series
    .map((s) => ({ label: s.label, value: lastValue(s.points) }))
    .filter((s): s is { label: string; value: number } => s.value != null);
  // Only what matters at each level: the nearest price line on either side
  // of it, and the first two oscillators. ATR is left out, since every
  // distance is already given in ATRs.
  const lines = now.filter((s) => !isOscillator(s.label));
  const oscillators = now.filter(
    (s) => isOscillator(s.label) && !s.label.startsWith("atr("),
  );
  const fired = evaluator(bars);
  const a = latestAtr(bars);
  const state = fired
    ? `Its ${fired.direction} rule fires on the latest bar.`
    : "Neither of its rules fires on the latest bar.";

  const levels =
    lines.length + oscillators.length === 0
      ? []
      : readEachLevel(plan, (price) => {
          const hypothetical =
            oscillators.length === 0
              ? []
              : computeScriptPlotSeries(ast, withHypotheticalClose(bars, price));
          const parts = [
            ...nearestLines(lines, price).map(
              (s) => `${distanceWords(price, s.value, a)} ${s.label} (${money(s.value)})`,
            ),
            ...oscillators.slice(0, MAX_OSCILLATORS_PER_LEVEL).map((s) => {
              const at = lastValue(
                hypothetical.find((h) => h.label === s.label)?.points ?? [],
              );
              return at == null
                ? `${s.label} has no reading`
                : `${s.label} would read ${fixed(at, 2)}`;
            }),
          ];
          return `${parts.join("; ")}.`;
        });

  return reading(
    `custom:${script.id}`,
    script.name,
    state,
    fired ? fired.direction : null,
    plan,
    levels,
  );
}

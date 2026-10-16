/**
 * Explain-the-math for a user's custom script (see ./types.ts). The script
 * explains GSPS's plan through the indicators it already names, so authors
 * write nothing new: price-scale lines (averages, bands, VWAP, PSAR,
 * Supertrend, trailing highs and lows) are compared with each plan level, and
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
  const fired = evaluator(bars);
  const a = latestAtr(bars);
  const state = fired
    ? `Its ${fired.direction} rule fires on the latest bar.`
    : "Neither of its rules fires on the latest bar.";

  const levels =
    now.length === 0
      ? []
      : readEachLevel(plan, (price) => {
          const hypothetical = computeScriptPlotSeries(
            ast,
            withHypotheticalClose(bars, price),
          );
          const parts = now.map((s) => {
            if (!isOscillator(s.label))
              return `${distanceWords(price, s.value, a)} ${s.label} (${money(s.value)})`;
            const at = lastValue(
              hypothetical.find((h) => h.label === s.label)?.points ?? [],
            );
            return at == null
              ? `${s.label} has no reading`
              : `${s.label} would read ${fixed(at, 2)}`;
          });
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

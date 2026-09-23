/**
 * Stochastic (14, 3, 3) %K/%D crossover — an intraday/swing reversal
 * strategy mode, one of `docs/STRATEGY_MODES.md`'s originally-deferred
 * candidates, picked up per direct request.
 *
 * Real, widely-traded technique: %K crossing %D while both sit in the
 * oversold (<20) or overbought (>80) zone is a standard momentum-reversal
 * signal, the same "recross from an extreme zone" shape `rsiReversal.ts`
 * uses for RSI's 30/70 bands, applied to a different oscillator with its own
 * zone convention.
 *
 * Three-question design basis:
 * 1. Gann grounding: none, deliberate — Strategy Modes carve-out.
 * 2. Cycle theory: the 14/3/3 windows are smoothing periods, not an asserted
 *    recurrence interval; Dewey's checklist doesn't apply, same answer
 *    `rsiReversal.ts` gives for its own oscillator.
 * 3. Hermetic principle: Polarity — 20 and 80 are the two poles %K/%D
 *    oscillate between, and this mode fires on the %K/%D cross specifically
 *    inside one pole's zone, i.e. the polarity reasserting itself — the same
 *    framing `rsiReversal.ts` gives 30/70.
 *
 * Entry: breakout of the crossover bar's high/low.
 * Stop: beyond the crossover bar's own extreme.
 */

import type { Bar } from "@/lib/types";
import type { StrategyLevels } from "./types";
import { buildLevels } from "./targets";
import { stochastic } from "./math";

export const OVERSOLD_ZONE = 20;
export const OVERBOUGHT_ZONE = 80;

export function evaluateStochastic(bars: Bar[]): StrategyLevels | null {
  const n = bars.length;
  if (n < 20) return null;
  const series = stochastic(bars);
  const i = n - 1;
  const prevI = n - 2;
  const point = series[i];
  const prevPoint = series[prevI];
  if (!point || !prevPoint) return null;

  const bar = bars[i];

  const crossedUpFromOversold =
    prevPoint.k <= prevPoint.d &&
    point.k > point.d &&
    prevPoint.k < OVERSOLD_ZONE &&
    point.k < OVERSOLD_ZONE + 10; // just emerging from the zone, not already back deep in mid-range

  const crossedDownFromOverbought =
    prevPoint.k >= prevPoint.d &&
    point.k < point.d &&
    prevPoint.k > OVERBOUGHT_ZONE &&
    point.k > OVERBOUGHT_ZONE - 10;

  if (crossedUpFromOversold) {
    return buildLevels(
      "stochastic",
      "bullish",
      bar.h,
      bar.l,
      `Stochastic %K crossed above %D emerging from oversold (<${OVERSOLD_ZONE}); entry on a break of this bar's high, stop below its low.`,
    );
  }

  if (crossedDownFromOverbought) {
    return buildLevels(
      "stochastic",
      "bearish",
      bar.l,
      bar.h,
      `Stochastic %K crossed below %D emerging from overbought (>${OVERBOUGHT_ZONE}); entry on a break of this bar's low, stop above its high.`,
    );
  }

  return null;
}

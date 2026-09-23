/**
 * MACD (12/26/9) momentum crossover — a swing momentum strategy mode.
 *
 * Real, widely-traded technique: the MACD line crossing its signal line is a
 * standard momentum-shift entry, most reliable read as a fresh-momentum
 * signal rather than a continuation one — this mode requires the histogram
 * to have just flipped sign (the actual crossover bar), not merely a
 * same-sign widening.
 *
 * Three-question design basis:
 * 1. Gann grounding: none, deliberate — Strategy Modes carve-out.
 * 2. Cycle theory: 12/26/9 are smoothing windows, not an asserted recurrence
 *    period; Dewey's checklist doesn't apply.
 * 3. Hermetic principle: Cause and Effect — the histogram flipping sign is
 *    read as the effect (a visible momentum shift) of a cause (the
 *    underlying trend already turning), which is the standard justification
 *    for treating a MACD cross as confirmation rather than prediction.
 *
 * Entry: breakout of the crossover bar's high/low.
 * Stop: the lower/higher of the last `SWING_LOOKBACK` bars' lows/highs, same
 * recent-swing convention `maCrossover.ts` uses, since a MACD cross — like an
 * MA cross — can land mid-swing where the triggering bar's own range is too
 * tight to be a meaningful stop.
 */

import type { Bar } from "@/lib/types";
import type { StrategyLevels } from "./types";
import { buildLevels } from "./targets";
import { macd, recentLow, recentHigh } from "./math";
import { SWING_LOOKBACK } from "./maCrossover";

export const BREAKOUT_BUFFER_PCT = 0.05;

export function evaluateMacdMomentum(bars: Bar[]): StrategyLevels | null {
  const n = bars.length;
  if (n < SWING_LOOKBACK + 2) return null;
  const series = macd(bars);
  const i = n - 1;
  const prevI = n - 2;
  const point = series[i];
  const prevPoint = series[prevI];
  if (!point || !prevPoint) return null;

  const crossedUp = prevPoint.histogram <= 0 && point.histogram > 0;
  const crossedDown = prevPoint.histogram >= 0 && point.histogram < 0;
  const bar = bars[i];

  if (crossedUp) {
    const entry = bar.h * (1 + BREAKOUT_BUFFER_PCT / 100);
    const stopLoss = recentLow(bars, i, SWING_LOOKBACK);
    return buildLevels(
      "macdMomentum",
      "bullish",
      entry,
      stopLoss,
      `MACD histogram flipped positive (bullish crossover); entry on a break of this bar's high, stop below the ${SWING_LOOKBACK}-bar swing low.`,
      2,
      4,
    );
  }

  if (crossedDown) {
    const entry = bar.l * (1 - BREAKOUT_BUFFER_PCT / 100);
    const stopLoss = recentHigh(bars, i, SWING_LOOKBACK);
    return buildLevels(
      "macdMomentum",
      "bearish",
      entry,
      stopLoss,
      `MACD histogram flipped negative (bearish crossover); entry on a break of this bar's low, stop above the ${SWING_LOOKBACK}-bar swing high.`,
      2,
      4,
    );
  }

  return null;
}

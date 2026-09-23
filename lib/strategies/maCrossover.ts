/**
 * EMA9/SMA20 crossover — a classic swing trend-following strategy mode.
 *
 * Real, widely-traded technique: a fast moving average crossing a slower one
 * is one of the oldest trend-following entry rules in technical analysis,
 * commonly paired with a recent-swing stop rather than a fixed percentage so
 * the stop sits at a level the market itself defined.
 *
 * Three-question design basis:
 * 1. Gann grounding: none. Deliberately outside AGENTS.md's citation
 *    discipline, per the Strategy Modes carve-out.
 * 2. Cycle theory: a moving-average crossover claims no fixed recurrence
 *    interval — it reacts to price/average relationship, not a period.
 *    Dewey's checklist doesn't apply.
 * 3. Hermetic principle: Rhythm — a moving average is a smoothed reading of
 *    the market's own rhythm; the crossover fires when the faster rhythm
 *    (9-bar) overtakes the slower one (20-bar), i.e. when the immediate
 *    trend outruns the intermediate one.
 *
 * Entry: breakout of the crossover bar's high/low by a small buffer.
 * Stop: the lower/higher of the last `SWING_LOOKBACK` bars' lows/highs — a
 * recent-swing stop, not the crossover bar's own extreme, since a crossover
 * can happen mid-swing where the triggering bar's own range is too tight to
 * be a meaningful stop.
 */

import type { Bar } from "@/lib/types";
import type { StrategyLevels } from "./types";
import { buildLevels } from "./targets";
import { ema, sma, recentLow, recentHigh } from "./math";

export const SWING_LOOKBACK = 10;
export const BREAKOUT_BUFFER_PCT = 0.05;

export function evaluateMaCrossover(bars: Bar[]): StrategyLevels | null {
  const n = bars.length;
  if (n < SWING_LOOKBACK + 2) return null;

  const ema9 = ema(bars, 9);
  const sma20 = sma(bars, 20);
  const i = n - 1;
  const prevI = n - 2;
  const fast = ema9[i];
  const slow = sma20[i];
  const fastPrev = ema9[prevI];
  const slowPrev = sma20[prevI];
  if (fast == null || slow == null || fastPrev == null || slowPrev == null) return null;

  const crossedUp = fastPrev <= slowPrev && fast > slow;
  const crossedDown = fastPrev >= slowPrev && fast < slow;
  const bar = bars[i];

  if (crossedUp) {
    const entry = bar.h * (1 + BREAKOUT_BUFFER_PCT / 100);
    const stopLoss = recentLow(bars, i, SWING_LOOKBACK);
    return buildLevels(
      "maCrossover",
      "bullish",
      entry,
      stopLoss,
      `EMA9 crossed above SMA20; entry on a break of this bar's high, stop below the ${SWING_LOOKBACK}-bar swing low.`,
      2,
      4,
    );
  }

  if (crossedDown) {
    const entry = bar.l * (1 - BREAKOUT_BUFFER_PCT / 100);
    const stopLoss = recentHigh(bars, i, SWING_LOOKBACK);
    return buildLevels(
      "maCrossover",
      "bearish",
      entry,
      stopLoss,
      `EMA9 crossed below SMA20; entry on a break of this bar's low, stop above the ${SWING_LOOKBACK}-bar swing high.`,
      2,
      4,
    );
  }

  return null;
}

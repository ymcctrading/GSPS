/**
 * Gann's 3-day and 9-day swing charts.
 *
 * A swing chart plots trend as a line that only reverses once price moves
 * against the prevailing swing for a fixed number of consecutive days —
 * filtering the noise a single higher-high or lower-low would react to. The
 * 3-day chart reacts to a smaller reversal than the 9-day; requiring both to
 * agree confirms the trend at two granularities of the same construction,
 * the way the retired macro-timeframe check required 2-of-3 timeframes
 * (monthly/weekly/daily) to agree before it was measured to be a net-negative
 * premise (see lib/validation/criteria-registry.ts's `macroTrend` entry).
 *
 * This reads daily closes only — no separate weekly/monthly resample — since
 * the swing count itself (3 days, 9 days) is what stands in for the coarser
 * timeframes.
 */

import type { Bar } from "@/lib/types";

export type SwingDirection = "bullish" | "bearish" | null;

/**
 * Walks closes in order, tracking the prevailing swing direction. A close
 * against the current swing starts (or extends) a run of opposing days; once
 * that run reaches `days`, the swing flips and the run resets. A close that
 * agrees with the swing resets the opposing run to zero. Flat closes (equal
 * to the prior close) neither extend nor reset the run.
 *
 * Returns null when there isn't enough history to establish an initial
 * direction (fewer than `days + 2` bars, or every close in that window is
 * flat) — scored as a fail the same way a missing ADX reading is, rather than
 * guessing a direction from insufficient data.
 */
export function swingChartDirection(bars: Bar[], days: number): SwingDirection {
  if (bars.length < days + 2) return null;

  let direction: SwingDirection = null;
  let opposingRun = 0;

  for (let i = 1; i < bars.length; i++) {
    const up = bars[i].c > bars[i - 1].c;
    const down = bars[i].c < bars[i - 1].c;
    if (!up && !down) continue; // flat close: neither extends nor resets the run

    if (direction === null) {
      direction = up ? "bullish" : "bearish";
      continue;
    }

    const against = direction === "bullish" ? down : up;
    if (against) {
      opposingRun++;
      if (opposingRun >= days) {
        direction = direction === "bullish" ? "bearish" : "bullish";
        opposingRun = 0;
      }
    } else {
      opposingRun = 0;
    }
  }

  return direction;
}

export interface SwingChartReading {
  threeDay: SwingDirection;
  nineDay: SwingDirection;
}

/** The two swing-chart reversal counts this criterion checks agreement across. */
export const SWING_CHART_DAYS = { threeDay: 3, nineDay: 9 } as const;

export function computeSwingChart(bars: Bar[]): SwingChartReading {
  return {
    threeDay: swingChartDirection(bars, SWING_CHART_DAYS.threeDay),
    nineDay: swingChartDirection(bars, SWING_CHART_DAYS.nineDay),
  };
}

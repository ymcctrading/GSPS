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

/**
 * Bar indices where the `days`-count swing chart's direction flipped — the
 * same walk `swingChartDirection` does, but recording every reversal rather
 * than only the final direction. Used by `computeCampaignLeg` below to count
 * how many 3-day-chart legs have printed since the last 9-day trend change.
 */
function swingReversalIndices(bars: Bar[], days: number): number[] {
  if (bars.length < days + 2) return [];

  const indices: number[] = [];
  let direction: SwingDirection = null;
  let opposingRun = 0;

  for (let i = 1; i < bars.length; i++) {
    const up = bars[i].c > bars[i - 1].c;
    const down = bars[i].c < bars[i - 1].c;
    if (!up && !down) continue;

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
        indices.push(i);
      }
    } else {
      opposingRun = 0;
    }
  }

  return indices;
}

/**
 * A completed swing's extreme — the "old top" or "old bottom" Gann's numbered
 * Buying and Selling Points are stated against (`docs/GANN_HISTORICAL_SOURCES.md`
 * A8: "crossing old tops/bottoms").
 */
export interface SwingPivot {
  /** Bar index where the extreme printed. */
  index: number;
  price: number;
  kind: "top" | "bottom";
}

/**
 * Every completed swing's extreme, oldest first.
 *
 * `swingReversalIndices` above records *where* the swing chart flipped; this
 * records *what price the swing reached* before it flipped, which is the
 * quantity Gann's entry rules are written against. A bullish swing's pivot is
 * the highest high it printed; a bearish swing's is the lowest low.
 *
 * Only completed swings are returned. The swing still in progress has no
 * settled extreme — price may still extend it — and an entry rule written
 * against a moving level is not the rule Gann stated.
 */
export function swingPivots(bars: Bar[], days: number): SwingPivot[] {
  const reversals = swingReversalIndices(bars, days);
  if (reversals.length === 0) return [];

  // Direction of the swing that ENDS at reversals[0]. A reversal flips the
  // swing, so the segment before the first recorded flip ran in the opposite
  // direction to the one the flip produced. Recovering it from the closes
  // around that flip keeps this consistent with the walk above rather than
  // re-deriving a direction from scratch.
  let direction: SwingDirection = null;
  for (let i = 1; i <= reversals[0]; i++) {
    const up = bars[i].c > bars[i - 1].c;
    const down = bars[i].c < bars[i - 1].c;
    if (!up && !down) continue;
    direction = up ? "bullish" : "bearish";
    break;
  }
  if (direction === null) return [];

  const pivots: SwingPivot[] = [];
  let start = 0;

  for (const end of reversals) {
    let bestIndex = start;
    for (let i = start; i <= end && i < bars.length; i++) {
      if (direction === "bullish") {
        if (bars[i].h > bars[bestIndex].h) bestIndex = i;
      } else if (bars[i].l < bars[bestIndex].l) {
        bestIndex = i;
      }
    }
    pivots.push({
      index: bestIndex,
      price: direction === "bullish" ? bars[bestIndex].h : bars[bestIndex].l,
      kind: direction === "bullish" ? "top" : "bottom",
    });
    direction = direction === "bullish" ? "bearish" : "bullish";
    start = end;
  }

  return pivots;
}

export type CampaignLegConfidence = "low" | "high" | "extended";

export interface CampaignLegReading {
  /** How many 3-day-chart legs (including the current, still-open one) have printed since the last 9-day trend change. Null when there isn't enough history to establish either swing chart. */
  legNumber: number | null;
  /**
   * Gann's own rule ("sections of a campaign" — *New Stock Trend Detector*
   * 1936, *How to Make Profits Trading in Commodities* 1941, *45 Years in
   * Wall Street* 1949): a bull/bear move typically runs 3-4 legs before a
   * genuine trend change is likely, and a reversal on the 3rd/4th leg is
   * trusted more than one on the 2nd. `"low"` = legs 1-2 (an early,
   * less-trusted wobble), `"high"` = legs 3-4 (the classic reversal zone),
   * `"extended"` = leg 5+ (an unusually stretched run outside Gann's own
   * disclosed 3-4 leg pattern — not itself a stronger or weaker read, just
   * outside the textbook case). Null when `legNumber` is null.
   */
  confidence: CampaignLegConfidence | null;
}

/**
 * Confluence/context only (per AGENTS.md's evidence-gating discipline —
 * every new criterion here stays out of `lib/scoring/score.ts`'s pass/fail
 * `swingChartAligned` boolean until a fresh backtest specifically measures
 * it): counts how many 3-day swing-chart legs have printed since the last
 * 9-day swing-chart direction change, and classifies that count against
 * Gann's disclosed 3-4-leg "sections of a campaign" pattern.
 */
export function computeCampaignLeg(bars: Bar[]): CampaignLegReading {
  const nineDayFlips = swingReversalIndices(bars, SWING_CHART_DAYS.nineDay);
  const threeDayFlips = swingReversalIndices(bars, SWING_CHART_DAYS.threeDay);
  if (bars.length < SWING_CHART_DAYS.nineDay + 2) {
    return { legNumber: null, confidence: null };
  }

  const lastNineDayFlip = nineDayFlips.length > 0 ? nineDayFlips[nineDayFlips.length - 1] : 0;
  const legsSinceMajorChange = threeDayFlips.filter((i) => i > lastNineDayFlip).length;
  const legNumber = legsSinceMajorChange + 1; // the current, still-open leg counts as one

  const confidence: CampaignLegConfidence = legNumber <= 2 ? "low" : legNumber <= 4 ? "high" : "extended";
  return { legNumber, confidence };
}

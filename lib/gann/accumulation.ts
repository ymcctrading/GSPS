/**
 * Gann's rule that the time spent in accumulation sets the size of the move
 * (parity roadmap G22, the accumulation half).
 *
 * Sources (Tier A): "The more time consumed in accumulation, the bigger the
 * advance," and the same for distribution (*Wall Street Stock Selector*
 * Ch. VII: six years of accumulation before a 164-point rise). Two to six or
 * ten to thirteen weeks in a narrow range, then crossing the range's tops or
 * breaking its bottoms: go with it, and the longer in range, the bigger the
 * move (Master Course). The longer before breaking into new ground, the bigger
 * the move: "accumulated energy" (*How to Make Profits in Commodities* p. 62).
 *
 * The reading: how long price has spent inside the range it is leaving (or
 * sitting in), counted back from the latest session while closes stay within
 * the range's high and low by the lost-motion allowance, and whether the
 * latest close has broken out of it and which way.
 *
 * Engineering choices, labelled as such: the range is the high and low of the
 * last `RANGE_LOOKBACK` completed sessions before the latest one; the count
 * stops at the first close outside it. `LONG_WEEKS` = 10 marks Gann's longer
 * band (10–13 weeks and beyond).
 *
 * Three-question basis:
 * 1. Gann: as cited, Tier A.
 * 2. Cycles: a time-for-price proportion, not a periodicity; Dewey does not apply.
 * 3. Hermetic: Cause and Effect (time in the range is the cause, the size of
 *    the move its effect) and Polarity (distribution is the mirror).
 */

import type { Bar } from "@/lib/types";
import { LOST_MOTION_BUFFER_PCT } from "@/lib/gann/entryTrigger";

export const RANGE_LOOKBACK = 20;
export const LONG_WEEKS = 10;

export interface AccumulationReading {
  rangeHigh: number;
  rangeLow: number;
  /** Weeks price has spent inside the range, up to the latest session. */
  weeks: number;
  /** The latest close left the range: up, down, or still inside. */
  breakout: "up" | "down" | null;
  long: boolean;
}

export function readAccumulation(daily: Bar[]): AccumulationReading | null {
  if (daily.length < RANGE_LOOKBACK + 2) return null;
  const last = daily[daily.length - 1];
  const window = daily.slice(-RANGE_LOOKBACK - 1, -1);
  const rangeHigh = Math.max(...window.map((b) => b.h));
  const rangeLow = Math.min(...window.map((b) => b.l));
  const a = LOST_MOTION_BUFFER_PCT / 100;
  const inside = (b: Bar) => b.c <= rangeHigh * (1 + a) && b.c >= rangeLow * (1 - a);
  let firstInside = daily.length - 2;
  while (firstInside > 0 && inside(daily[firstInside - 1])) firstInside--;
  const days = (Date.parse(daily[daily.length - 2].t) - Date.parse(daily[firstInside].t)) / 86_400_000;
  const weeks = Math.max(0, days / 7);
  const breakout = last.c > rangeHigh * (1 + a) ? "up" : last.c < rangeLow * (1 - a) ? "down" : null;
  return { rangeHigh, rangeLow, weeks, breakout, long: weeks >= LONG_WEEKS };
}

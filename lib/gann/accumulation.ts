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
 * the range's high and low by the 3-point allowance, and whether the
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
import { beyondByThreePoints } from "@/lib/gann/pointScale";

export const RANGE_LOOKBACK = 20;
export const LONG_WEEKS = 10;
/**
 * How many recent sessions are searched for the session that left a long base
 * (`left`): four weeks, the range's own length. An engineering choice,
 * labelled: Gann gives the breakout, not how long after it a buy still counts.
 */
export const BASE_LEFT_SESSIONS = 20;

/**
 * A long base price has left, and still stands outside (2026-10-28). Gann's
 * rule is the time in the range *then* the crossing: "two to six or ten to
 * thirteen weeks in a narrow range, then crossing the range's tops or
 * breaking its bottoms: go with it, and the longer in range, the bigger the
 * move" (Master Course); "the longer before breaking into new ground, the
 * bigger the move" (*Commodities* p. 62). So a base is accumulation for a
 * buy only once price has crossed its top, and distribution for a sale only
 * once it has broken its bottom. Price still inside the range confirms
 * neither side. "Still outside": no close since back 3 points inside the
 * crossed extreme (W006 Rule 3(c) p.47: after crossing an old top it "should
 * not react 3 points below the old high").
 */
export interface BaseLeft {
  direction: "up" | "down";
  /** Sessions since the close that left the base (0: the latest). */
  sessionsAgo: number;
  /** Weeks the base had held before it was left. */
  weeks: number;
}

export interface AccumulationReading {
  rangeHigh: number;
  rangeLow: number;
  /** Weeks price has spent inside the range, up to the latest session. */
  weeks: number;
  /** The latest close left the range: up, down, or still inside. */
  breakout: "up" | "down" | null;
  long: boolean;
  /** The long base price has left within `BASE_LEFT_SESSIONS` and stands outside of, or null. */
  left: BaseLeft | null;
}

export type RangeReading = Omit<AccumulationReading, "left">;

/** The range reading as of session `end` (inclusive), from the sessions up to it. */
function readRangeAt(daily: Bar[], end: number): RangeReading | null {
  if (end + 1 < RANGE_LOOKBACK + 2) return null;
  const last = daily[end];
  const window = daily.slice(end - RANGE_LOOKBACK, end);
  const rangeHigh = Math.max(...window.map((b) => b.h));
  const rangeLow = Math.min(...window.map((b) => b.l));
  const upper = beyondByThreePoints(rangeHigh, 1);
  const lower = beyondByThreePoints(rangeLow, -1);
  const inside = (b: Bar) => b.c <= upper && b.c >= lower;
  let firstInside = end - 1;
  while (firstInside > 0 && inside(daily[firstInside - 1])) firstInside--;
  const days = (Date.parse(daily[end - 1].t) - Date.parse(daily[firstInside].t)) / 86_400_000;
  const weeks = Math.max(0, days / 7);
  const breakout = last.c > upper ? "up" : last.c < lower ? "down" : null;
  return { rangeHigh, rangeLow, weeks, breakout, long: weeks >= LONG_WEEKS };
}

/** The most recent long base left within `BASE_LEFT_SESSIONS` sessions and not re-entered (see `BaseLeft`). */
export function readBaseLeft(daily: Bar[]): BaseLeft | null {
  for (let k = 0; k < BASE_LEFT_SESSIONS; k++) {
    const end = daily.length - 1 - k;
    const r = readRangeAt(daily, end);
    if (!r) return null;
    if (!r.long || r.breakout === null) continue;
    const since = daily.slice(end + 1);
    const holds =
      r.breakout === "up"
        ? since.every((b) => b.c >= beyondByThreePoints(r.rangeHigh, -1))
        : since.every((b) => b.c <= beyondByThreePoints(r.rangeLow, 1));
    if (holds) return { direction: r.breakout, sessionsAgo: k, weeks: r.weeks };
  }
  return null;
}

/**
 * The range reading at the latest session only, without the search for a base
 * just left: for callers that read it many times over and use only the range
 * and the latest break (`distribution.ts`), so they don't pay for the search.
 */
export function readAccumulationRange(daily: Bar[]): RangeReading | null {
  return readRangeAt(daily, daily.length - 1);
}

export function readAccumulation(daily: Bar[]): AccumulationReading | null {
  const now = readRangeAt(daily, daily.length - 1);
  if (!now) return null;
  return { ...now, left: readBaseLeft(daily) };
}

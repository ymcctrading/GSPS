/**
 * A narrow range breaking into a sharp move (C-ENTRY-02). A compiler of Gann's
 * teaching (W003 p.17, class C): a narrow 3-4 day range breaks into a sharp
 * 3-day move. "Narrow" is not defined there.
 *
 * Context only, measured (`contextFactors.ts`, `narrowRangeBreakAgrees`),
 * never a gate or an order: the rule is the compiler's, not Gann's own text.
 * Gann's own narrow-range rules (the 2-6 week breakaway, accumulation) are in
 * `breakaway.ts` and `accumulation.ts`.
 *
 * Reading choices, labelled as such and fixed before any measurement: the
 * range is the four sessions before the last, or the three (W003's "3-4
 * day"; batch review C1), narrow when its high-to-low span is no wider than
 * `NARROW_RANGE_ATR_FRACTION` of the average day (14-session true range
 * before it); the break is the last session closing beyond it. The four-day
 * range is read first. The sharp 3-day move that follows is the outcome the
 * replay measures, so it is not read here.
 *
 * Three-question basis: 1. Class C (W003), not Gann's own text. 2. No claim
 * about periodicity. 3. Rhythm: contraction followed by expansion.
 */
import type { Bar } from "@/lib/types";
import { atr } from "@/lib/analysis/pivots";

/** A three- or four-day range no wider than one average day is narrow. Pre-registered. */
export const NARROW_RANGE_ATR_FRACTION = 1;
/** The range lengths read, longest first (W003 p.17, "3-4 day"). */
const RANGE_DAYS = [4, 3] as const;

export interface NarrowRangeBreakReading {
  direction: "bullish" | "bearish";
  days: number;
  rangeHigh: number;
  rangeLow: number;
}

export function readNarrowRangeBreak(bars: Bar[]): NarrowRangeBreakReading | null {
  for (const days of RANGE_DAYS) {
    const r = breakOf(bars, days);
    if (r) return r;
  }
  return null;
}

function breakOf(bars: Bar[], days: number): NarrowRangeBreakReading | null {
  if (bars.length < days + 16) return null;
  const range = bars.slice(-days - 1, -1);
  const rangeHigh = Math.max(...range.map((b) => b.h));
  const rangeLow = Math.min(...range.map((b) => b.l));
  const day = atr(bars.slice(-days - 16, -days - 1), 14);
  if (!(day > 0) || rangeHigh - rangeLow > NARROW_RANGE_ATR_FRACTION * day) return null;
  const close = bars[bars.length - 1].c;
  if (close > rangeHigh) return { direction: "bullish", days, rangeHigh, rangeLow };
  if (close < rangeLow) return { direction: "bearish", days, rangeHigh, rangeLow };
  return null;
}

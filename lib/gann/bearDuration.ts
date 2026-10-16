/**
 * Bear-market duration (A-TIME-06, W006 p.13). Gann's record of bear markets:
 * the greatest ran no more than 43 months and the shortest 12, culminating
 * near the 27th, 30th, 34th and 36th-43rd months; from the 1929 top he watched
 * for a bottom in the 30th-36th month, then the 40th-43rd. On pp.15-16 the
 * 1929-32 buyers lost because "the time period had not run out".
 *
 * How GSPS reads it: months from the market's bear-market top (SPY's highest
 * month before its two-bar monthly chart turned down, `marketBearStart`, the
 * mirror of the bull-market start the weak-stock readings use; item 7 map fork
 * F4, the market's bear) to the month in hand. Context only, live and in the
 * replay: shown on the setup and measured, never gating. Whether "time not run
 * out" holds a long is fork F1, held for the owner.
 *
 * Conflicts recorded, not resolved: the same page lists a 53-month bear, past
 * its own 43-month ceiling, and the Master Course gives 34 months 5 days as
 * the greatest (map fork F3). The windows are W006's explicit ones; no
 * ceiling gates anything.
 *
 * Three-question basis. Gann: W006 p.13, class A. Cycles: Gann's durations are
 * a hit list from a handful of bears (Dewey's repetition count is low, and
 * constancy of period is not claimed); hence context, not a gate, until the
 * base rate is measured (CYC-24). Hermetic: Rhythm, the swing out of a bull
 * market running its time before it swings back.
 */
import type { Bar } from "@/lib/types";
import { marketBearStart } from "@/lib/gann/leadership";
import { monthsElapsed } from "@/lib/gann/angleMonthCounts";

export const BEAR_SHORTEST_MONTHS = 12;
export const BEAR_LONGEST_MONTHS = 43;
/** From a top, watch for a bottom in these months. */
export const BEAR_BOTTOM_WINDOWS: readonly (readonly [number, number])[] = [
  [30, 36],
  [40, 43],
];
/** Culminations near these months, and through 36-43. */
export const BEAR_CULMINATION_MONTHS: readonly number[] = [27, 30, 34];
export const BEAR_CULMINATION_RUN: readonly [number, number] = [36, 43];

export interface BearDurationReading {
  /** The market's bear-market top (YYYY-MM). */
  topMonth: string;
  /** Calendar months from the top to the month read. */
  months: number;
  /** In the 30-36 or 40-43 month bottom windows. */
  inBottomWindow: boolean;
  /** Near a culmination month (27, 30, 34, or 36-43). */
  nearCulmination: boolean;
  /** Shorter than the shortest bear market (12 months): time has not run out. */
  beforeShortest: boolean;
  /** Longer than the greatest (43 months). */
  pastLongest: boolean;
}

/** Null while the market's monthly chart is not in a bear trend. */
export function readBearDuration(marketMonthly: Bar[], asOf: Date): BearDurationReading | null {
  const topMonth = marketBearStart(marketMonthly);
  if (!topMonth) return null;
  const months = monthsElapsed(new Date(`${topMonth}-01T00:00:00Z`), asOf);
  return {
    topMonth,
    months,
    inBottomWindow: BEAR_BOTTOM_WINDOWS.some(([lo, hi]) => months >= lo && months <= hi),
    nearCulmination:
      BEAR_CULMINATION_MONTHS.includes(months) || (months >= BEAR_CULMINATION_RUN[0] && months <= BEAR_CULMINATION_RUN[1]),
    beforeShortest: months < BEAR_SHORTEST_MONTHS,
    pastLongest: months > BEAR_LONGEST_MONTHS,
  };
}

export function describeBearDuration(r: BearDurationReading): string {
  const where = r.inBottomWindow
    ? "inside the 30-36 and 40-43 month windows where bear markets have made their bottoms"
    : r.beforeShortest
      ? "shorter than the shortest bear market on record (12 months), so its time has not run out"
      : r.pastLongest
        ? "longer than the longest on record (43 months)"
        : r.nearCulmination
          ? "near a month where bear markets have culminated"
          : "outside the months where bear markets have made their bottoms";
  return `The market's bear market is in its month ${r.months} from the ${r.topMonth} top: ${where}. Shown for context; it does not change the setup.`;
}

/**
 * Gann's day stop: a stop a set number of his points beyond a day's low (a
 * day's high for a short), never looser than the plan's own stop. The one
 * implementation of this rule on the platform (agreed 2026-10-21 between the
 * trade-style and intraday threads): the Fast style's trail (`readGannExit`,
 * "day_low", which ratchets it) and the intraday "daily plan's level held"
 * alert both call it.
 *
 * Sources (Tier A, Gann's own text):
 * - W006 Rule 2, p.46: stop orders "1, 2 or 3 points away"; "a 3-points stop
 *   loss order is the safest to use as it will be caught less than any other";
 *   in fast moves trail "1 to 3 points under the day's low" (5 under each
 *   day's high at high levels).
 * - *Truth of the Stock Tape*: in active markets reactions seldom last more
 *   than 2 days, "buy on the second day's reaction and stop three points".
 * - *Commodities*, Selling Point 9: sell the 2-day rallies in a fast decline
 *   with the stop above the prior day's high; "fast-declining markets will
 *   often run 10 to 30 days without crossing the high of the previous day".
 * - His 1940-41 soybean trade (Chart No. 18): in the runaway move, stops 1
 *   cent under each day's low.
 *
 * Points are price-scaled (`pointScale.ts#pricePoint`), read at the day's
 * extreme. The default of 3 points is Gann's "safest" stop.
 *
 * Three-question basis: 1. Gann, as cited. 2. No periodicity claim; Dewey's
 * checklist does not apply. 3. Polarity: the short is the exact mirror (the
 * day's high, the stop above it). Law of Creation: day ⊗ trade, the day's own
 * extreme becomes the trade's line, and it moves each day the trade lives.
 */

import { pricePoint } from "@/lib/gann/pointScale";

export interface DayStopInput {
  /** The day's low for a long, the day's high for a short. */
  extreme: number;
  side: "long" | "short";
  /** Gann points beyond the extreme. Default 3, Gann's "safest" stop. */
  points?: number;
  /**
   * The plan's own stop. The day stop never sits farther from the entry than
   * this (a day stop tightens a plan, it never widens its risk).
   */
  planStop?: number | null;
}

/** Gann's day stop, or null when the extreme is not a price. */
export function gannDayStop({ extreme, side, points = 3, planStop = null }: DayStopInput): number | null {
  if (!(extreme > 0) || !(points >= 0)) return null;
  const offset = points * pricePoint(extreme);
  const raw = side === "long" ? extreme - offset : extreme + offset;
  if (planStop == null || !(planStop > 0)) return raw;
  return side === "long" ? Math.max(raw, planStop) : Math.min(raw, planStop);
}

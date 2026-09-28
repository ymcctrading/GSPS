/**
 * Gann's seasonal time periods counted from March 21 (parity roadmap G8).
 *
 * Source (Tier A, Master Course; `docs/memory-bank/sources/A2_1_master_stock_market_course.md`):
 * the seasonal year starts at the spring equinox, March 21, not January 1. Its
 * eighths and thirds fall on May 5 (⅛), June 21 (¼), July 23 (⅓), August 5
 * (⅜), September 22 (½), November 8 (⅝), November 22 (⅔), December 21 (¾),
 * February 4 (⅞) and March 20 (the full year). "Important changes in trend
 * occur around these midseason dates" (the ⅛ points). Within a technique Gann
 * ranks the fractions: ½ first, then ¼ and ¾, then ⅓ and ⅔, then the eighths,
 * the same order as his year fractions (`timeCycles.ts`).
 *
 * `lib/gann/timeCycles.ts`'s fixed calendar already carries the quarter and
 * midseason windows; this module adds what it lacked: the count itself (which
 * fraction of the seasonal year today sits on) and its rank, so the ranking
 * can be read and measured. The ⅓ and ⅔ dates join the fixed calendar too.
 *
 * Engineering choice, labelled as such: "around" is ±`SEASONAL_TOLERANCE_DAYS`.
 *
 * Three-question basis:
 * 1. Gann: as cited, Tier A.
 * 2. Cycles: an annual recurrence claim. Dewey: repetition count is Gann's 35
 *    years of U.S. Steel quarters; regularity and dominance are not measured by
 *    him. The replay's factor table is the base-rate test (not yet cleared).
 * 3. Hermetic: Rhythm (the solar year returns) and Correspondence (the same
 *    fractions divide a year of time as divide a range of price).
 */

export const SEASONAL_TOLERANCE_DAYS = 2;

export interface SeasonalPoint {
  label: string;
  /** Month (1-12) and day. */
  month: number;
  day: number;
  /** 1 highest. */
  rank: 1 | 2 | 3 | 4;
}

export const SEASONAL_POINTS: readonly SeasonalPoint[] = [
  { label: "⅛ (midseason)", month: 5, day: 5, rank: 4 },
  { label: "¼", month: 6, day: 21, rank: 2 },
  { label: "⅓", month: 7, day: 23, rank: 3 },
  { label: "⅜ (midseason)", month: 8, day: 5, rank: 4 },
  { label: "½", month: 9, day: 22, rank: 1 },
  { label: "⅝ (midseason)", month: 11, day: 8, rank: 4 },
  { label: "⅔", month: 11, day: 22, rank: 3 },
  { label: "¾", month: 12, day: 21, rank: 2 },
  { label: "⅞ (midseason)", month: 2, day: 4, rank: 4 },
  { label: "the full year", month: 3, day: 21, rank: 1 },
];

export interface SeasonalCountReading {
  point: SeasonalPoint;
  /** Days from the point (negative before it). */
  offsetDays: number;
}

const DAY_MS = 86_400_000;

/** The seasonal point today sits on (±tolerance), if any. Highest rank wins a tie. */
export function readSeasonalCount(asOf: Date): SeasonalCountReading | null {
  const today = Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate());
  let best: SeasonalCountReading | null = null;
  for (const y of [asOf.getUTCFullYear() - 1, asOf.getUTCFullYear(), asOf.getUTCFullYear() + 1]) {
    for (const p of SEASONAL_POINTS) {
      const offsetDays = Math.round((today - Date.UTC(y, p.month - 1, p.day)) / DAY_MS);
      if (Math.abs(offsetDays) > SEASONAL_TOLERANCE_DAYS) continue;
      if (!best || p.rank < best.point.rank) best = { point: p, offsetDays };
    }
  }
  return best;
}

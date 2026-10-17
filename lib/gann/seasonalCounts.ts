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
 * **The sixteenths, added 2026-09-30.** Gann's Square of Nine plate labels the
 * wheel every 22.5° with a date (Collected Writings Vol. 3 p. 34; the Cycles
 * Research Institute workbook, source note B12): April 12, May 27, July 14,
 * August 31, October 15, November 30, January 13 and February 28, between the
 * eighths. His 1951 lesson gives 1/16 of a year (about 23 days) as why moves so
 * often run three weeks to a month (Master Course Ch. 17). They rank below the
 * eighths (rank 5), the next division down in his order. The plate's dates are
 * used as printed: they are the Sun's 22.5° points, so they are not equal day
 * counts (the summer half of the year is longer), and Gann's dates win over an
 * even split.
 *
 * **The ranking, checked 2026-10-16 (M-T8).** Ch. 18 TP-1 (PDF 439, 1955):
 * "Most important: 1/2 and the end of the season; next 1/4 and 3/4, and 1/3
 * and 2/3". The season in that lesson is the seasonal year from March 20, so
 * "the end of the season" is read as the full year, which already ranks with
 * ½. Reading it as every quarter day would put ¼ and ¾ with ½, against the
 * same sentence's "next 1/4 and 3/4", so the ranks are unchanged.
 *
 * **The Winter-quarter frame, added 2026-10-16 (C-TIME-05).** The c.1935
 * lesson counts the seasons from the Winter quarter, December 22 (Ch. 5 PDF
 * 161): January 5-6 (15 days), February 5 (45 days), March 21 (90 days, "the
 * Sun crosses the equator"), May 6 (135°), June 22, July 7, August 8,
 * September 23, November 8 and December 22. It is a second frame with its own
 * dates (January 5-6, February 5 and July 7 have no March 21 counterpart),
 * so it is kept as its own list (`WINTER_QUARTER_POINTS`) and read as context
 * through `timeCounts.ts`, never ranked into `SEASONAL_POINTS`. The lesson
 * gives it no ranking.
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
  /** 1 highest; 5 is the sixteenths. */
  rank: 1 | 2 | 3 | 4 | 5;
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
  // The sixteenths, as dated on Gann's Square of Nine plate (every 22.5°).
  { label: "1/16", month: 4, day: 12, rank: 5 },
  { label: "3/16", month: 5, day: 27, rank: 5 },
  { label: "5/16", month: 7, day: 14, rank: 5 },
  { label: "7/16", month: 8, day: 31, rank: 5 },
  { label: "9/16", month: 10, day: 15, rank: 5 },
  { label: "11/16", month: 11, day: 30, rank: 5 },
  { label: "13/16", month: 1, day: 13, rank: 5 },
  { label: "15/16", month: 2, day: 28, rank: 5 },
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

/** C-TIME-05: the Winter-quarter seasonal dates (Master Course Ch. 5 PDF 161), days inclusive. */
export const WINTER_QUARTER_POINTS: readonly { label: string; month: number; startDay: number; endDay: number }[] = [
  { label: "15 days", month: 1, startDay: 5, endDay: 6 },
  { label: "45 days", month: 2, startDay: 5, endDay: 5 },
  { label: "90 days", month: 3, startDay: 21, endDay: 21 },
  { label: "135°", month: 5, startDay: 6, endDay: 6 },
  { label: "June 22", month: 6, startDay: 22, endDay: 22 },
  { label: "July 7", month: 7, startDay: 7, endDay: 7 },
  { label: "August 8", month: 8, startDay: 8, endDay: 8 },
  { label: "September 23", month: 9, startDay: 23, endDay: 23 },
  { label: "November 8", month: 11, startDay: 8, endDay: 8 },
  { label: "the full year", month: 12, startDay: 22, endDay: 22 },
];

export interface WinterQuarterReading {
  point: (typeof WINTER_QUARTER_POINTS)[number];
  /** Days from the point's nearest day (negative before it, 0 inside it). */
  offsetDays: number;
}

/** The Winter-quarter date today sits on (±tolerance), nearest first, or null. */
export function readWinterQuarterCount(asOf: Date): WinterQuarterReading | null {
  const today = Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate());
  let best: WinterQuarterReading | null = null;
  for (const y of [asOf.getUTCFullYear() - 1, asOf.getUTCFullYear(), asOf.getUTCFullYear() + 1]) {
    for (const p of WINTER_QUARTER_POINTS) {
      const start = Date.UTC(y, p.month - 1, p.startDay);
      const end = Date.UTC(y, p.month - 1, p.endDay);
      const offsetDays = today < start ? Math.round((today - start) / DAY_MS) : today > end ? Math.round((today - end) / DAY_MS) : 0;
      if (Math.abs(offsetDays) > SEASONAL_TOLERANCE_DAYS) continue;
      if (!best || Math.abs(offsetDays) < Math.abs(best.offsetDays)) best = { point: p, offsetDays };
    }
  }
  return best;
}

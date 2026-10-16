/**
 * Gann's readings of price itself, as context (PLAN.md item 9, step 3c).
 * None of them gates, sizes or prices a plan: they reach the card and
 * `contextFactors` only.
 *
 * - A-PRICE-01 (W006 pp.22-23, class A): moves speed up above 50, faster
 *   above 100 and very wide above 150-200, and the first 50 to 100 points
 *   down from an extreme high fall fastest. `priceZone` names the zone in
 *   Gann's literal dollars, labelled as his 1930 figures rather than scaled
 *   (the 3-point allowance is the scaled reading, `pointScale.ts`).
 *   `readFirstFallFromHigh` reads the fall from the 52-week entry chart's
 *   high, on completed sessions,
 *   the same 52 weeks `entryChartBars` gives the entry chart.
 * - A-PRICE-06 (W036 pp.12, 22, class A): each market has an expected annual
 *   range. Gann's 1921 figures are not ported; `annualRange` is the median
 *   calendar-year high-to-low of the symbol's own completed years, over the
 *   `OLDER_LEVELS_YEARS` before the session. On the same page he warns not to
 *   lean on the number of points and to watch the dates, so it stays context.
 * - C-LEVELS-01 (W003 p.16, class C): squares of whole numbers and the points
 *   halfway between, "not tradable alone". Card only; never a target or a
 *   support and resistance level.
 * - A-PRICE-05 (W046 p.1, class A; the Master Course's 1 point a month for a
 *   45-degree line): a line from a low at a fixed number of points per
 *   calendar month. `pointsPerMonth` is a labelled per-instrument input; the
 *   card uses the Master Course's 1 a month for stocks. The fans read Gann
 *   points a daily bar since Q27 (2026-10-16), the same point scale.
 *
 * Engineering choices, labelled: the first fall starts once price is under
 * the high by more than the 3-point allowance and ends at 100 points (the top
 * of Gann's 50-100); the zones' edges belong to the higher zone (50 reads
 * "50 to 100"); the annual range needs one completed year.
 *
 * Three-question basis:
 * 1. Gann: as cited above, class A except C-LEVELS-01.
 * 2. Cycles: the annual range reads one calendar year per sample, with no
 *    claim about its period, so Dewey's checklist does not apply.
 * 3. Hermetic: Vibration (speed rises with price, a higher rate at a higher
 *    level) and Correspondence (the same readings on every symbol, in its own
 *    units).
 */
import type { Bar } from "@/lib/types";
import { etDateKey } from "@/lib/market/session";
import { OLDER_LEVELS_YEARS } from "@/lib/gann/entryTrigger";
import { gannThreePoints } from "@/lib/gann/pointScale";

export type PriceZone = "under 50" | "50 to 100" | "100 to 150" | "150 to 200" | "over 200";

/** Gann's price zones in his literal dollars (A-PRICE-01). */
export function priceZone(price: number): PriceZone {
  if (price < 50) return "under 50";
  if (price < 100) return "50 to 100";
  if (price < 150) return "100 to 150";
  if (price < 200) return "150 to 200";
  return "over 200";
}

/**
 * The 52 weeks the high is read from: `ENTRY_CHART_DAYS` in
 * `lib/scan/entrySelection.ts`, restated here because that module imports
 * this one's caller (an import cycle); a test pins the two equal.
 */
export const FIRST_FALL_CHART_DAYS = 364;

/** The top of Gann's "first 50 to 100 points" down from a high. */
export const FIRST_FALL_POINTS = 100;

export interface FirstFallReading {
  /** The 52-week entry chart's highest high, completed sessions. */
  high: number;
  /** The last completed close's distance under it, in points. */
  pointsDown: number;
  /** Under the high by more than the 3-point allowance and by no more than `FIRST_FALL_POINTS`. */
  inFirstFall: boolean;
}

export function readFirstFallFromHigh(daily: Bar[], asOf: Date): FirstFallReading | null {
  const today = etDateKey(asOf);
  const from = new Date(Date.parse(`${today}T00:00:00Z`) - FIRST_FALL_CHART_DAYS * 86_400_000).toISOString().slice(0, 10);
  // The same window as `entryChartBars`: the 52 weeks before the session.
  const bars = daily.filter((b) => b.t.slice(0, 10) >= from && b.t.slice(0, 10) < today);
  if (bars.length === 0) return null;
  const high = bars.reduce((m, b) => Math.max(m, b.h), -Infinity);
  const pointsDown = high - bars[bars.length - 1].c;
  return { high, pointsDown, inFirstFall: pointsDown > gannThreePoints(high) && pointsDown <= FIRST_FALL_POINTS };
}

export interface AnnualRangeReading {
  /** Completed calendar years read. */
  years: number;
  /** The median of their high-to-low ranges, in points. */
  medianPoints: number;
}

/** The symbol's own expected annual range (A-PRICE-06), from monthly bars. */
export function annualRange(monthly: Bar[], asOf: Date): AnnualRangeReading | null {
  const year = Number(etDateKey(asOf).slice(0, 4));
  const ranges: number[] = [];
  for (let y = year - 1; y >= year - OLDER_LEVELS_YEARS; y--) {
    const months = monthly.filter((b) => b.t.slice(0, 4) === String(y));
    if (months.length === 0) continue;
    const hi = months.reduce((m, b) => Math.max(m, b.h), -Infinity);
    const lo = months.reduce((m, b) => Math.min(m, b.l), Infinity);
    ranges.push(hi - lo);
  }
  if (ranges.length === 0) return null;
  ranges.sort((a, b) => a - b);
  const mid = ranges.length >> 1;
  const medianPoints = ranges.length % 2 ? ranges[mid] : (ranges[mid - 1] + ranges[mid]) / 2;
  return { years: ranges.length, medianPoints };
}

/** The squares of the whole numbers either side of `price`'s root and the point halfway between (C-LEVELS-01). */
export function integerSquareLevels(price: number): [number, number, number] {
  const n = Math.floor(Math.sqrt(Math.max(0, price)));
  const lower = n * n;
  const upper = (n + 1) * (n + 1);
  return [lower, (lower + upper) / 2, upper];
}

/** The Master Course's 45-degree rate for stocks: 1 point a calendar month. */
export const STOCK_POINTS_PER_MONTH = 1;

/** A line from `low` in month `lowMonth` ("YYYY-MM") at `pointsPerMonth`, read at `asOfMonth` (A-PRICE-05). */
export function monthlyAngle(low: number, lowMonth: string, pointsPerMonth: number, asOfMonth: string): number {
  const months =
    (Number(asOfMonth.slice(0, 4)) - Number(lowMonth.slice(0, 4))) * 12 +
    (Number(asOfMonth.slice(5, 7)) - Number(lowMonth.slice(5, 7)));
  return low + pointsPerMonth * months;
}

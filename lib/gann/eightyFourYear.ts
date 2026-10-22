/**
 * The 84-year cycle on the market's own record (C-ASTRO-05).
 *
 * Gann lists the 84-year cycle among his time periods, with its halves of 42,
 * 21 and 10½ years (Master Course Ch. 7, PDF 219; "84 months or 84° is 7/8 of
 * 90", PDF 223-224). The researcher's reading in the collection (Meadors, W027)
 * ties it to Uranus' return and gives one example, the low of 19 October 1987
 * against 9 November 1903; that tie is his, not Gann's, and is not built.
 *
 * Built: a major monthly turn of the market 84 years back to the month (a low
 * marks a low due, a high a high), the exact-month rule the stock's yearly
 * counts use (`yearCycleHits`). The stock's own record never reaches 84 years,
 * so it is read on the market's (`marketHistory.json`). Context and a measured
 * factor (`eightyFourYearCountWithTrade`); nothing here moves a score, gate,
 * plan or order, and no date ahead is shown to a person.
 *
 * Engineering choices, labelled: the record is Shiller's monthly S&P composite,
 * a stand-in for the Dow Gann read; turns are `findPivots` at 3 months with
 * `majorPivots`' top quartile of the record before the month read, on the
 * logarithm of the price so a swing in 1900 weighs as a swing of the same
 * proportion in 2000.
 *
 * Three-question basis:
 * 1. Gann: Tier A for the count; the Uranus tie is Tier C context.
 * 2. Cycles: one repetition in the record at most for each anchor (1871 + 84
 *    = 1955), so Dewey's repetition count is not cleared; context only.
 * 3. Hermetic: Rhythm, the long swing returning at its period.
 */
import history from "@/lib/gann/marketHistory.json";
import { findPivots, majorPivots } from "@/lib/analysis/pivots";
import { etDateKey } from "@/lib/market/session";
import type { Bar } from "@/lib/types";

export const EIGHTY_FOUR_YEARS = 84;

export interface MarketCountHit {
  years: number;
  kind: "high" | "low";
  /** The anchor's month, "YYYY-MM". */
  pivotMonth: string;
}

const record = history as { start: string; stocks: (number | null)[] };
const [y0, m0] = record.start.split("-").map(Number);
/** The whole record as monthly bars on the logarithm of the price. */
const allBars: Bar[] = record.stocks.flatMap((v, i) => {
  if (v === null) return [];
  const n = y0 * 12 + (m0 - 1) + i;
  const t = `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, "0")}-01T00:00:00Z`;
  const x = Math.log(v);
  return [{ t, o: x, h: x, l: x, c: x, v: 0 }];
});
const anchorsByMonth = new Map<string, { month: string; kind: "high" | "low" }[]>();

/**
 * The market's major monthly turns as they stood before `month` ("YYYY-MM"):
 * only the months before it are read, so "major" (the top quartile of swings)
 * never depends on a swing after the reading. Cached per month.
 */
function marketAnchors(month: string): { month: string; kind: "high" | "low" }[] {
  const cached = anchorsByMonth.get(month);
  if (cached) return cached;
  const bars = allBars.filter((b) => b.t.slice(0, 7) < month);
  const out = majorPivots(findPivots(bars, 3)).map((p) => ({ month: p.bar.t.slice(0, 7), kind: p.kind }));
  anchorsByMonth.set(month, out);
  return out;
}

/** The market's major turn exactly `years` back from the New York month of `asOf`, if any. */
export function marketCountHit(asOf: Date, years: number = EIGHTY_FOUR_YEARS): MarketCountHit | null {
  const now = etDateKey(asOf).slice(0, 7);
  const [y, m] = now.split("-").map(Number);
  const target = `${y - years}-${String(m).padStart(2, "0")}`;
  const hit = marketAnchors(now).find((a) => a.month === target);
  return hit ? { years, kind: hit.kind, pivotMonth: hit.month } : null;
}

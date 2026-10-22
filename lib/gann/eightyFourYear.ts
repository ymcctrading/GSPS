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
 * `majorPivots`' top quartile, read on the logarithm of the price so a swing
 * in 1900 weighs as a swing of the same proportion in 2000.
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

let anchors: { month: string; kind: "high" | "low" }[] | null = null;

/** The market's major monthly turns, read once. */
function marketAnchors(): { month: string; kind: "high" | "low" }[] {
  if (anchors) return anchors;
  const record = history as { start: string; stocks: (number | null)[] };
  const [y0, m0] = record.start.split("-").map(Number);
  const bars: Bar[] = [];
  record.stocks.forEach((v, i) => {
    if (v === null) return;
    const n = y0 * 12 + (m0 - 1) + i;
    const t = `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, "0")}-01T00:00:00Z`;
    const x = Math.log(v);
    bars.push({ t, o: x, h: x, l: x, c: x, v: 0 });
  });
  anchors = majorPivots(findPivots(bars, 3)).map((p) => ({ month: p.bar.t.slice(0, 7), kind: p.kind }));
  return anchors;
}

/** The market's major turn exactly `years` back from the New York month of `asOf`, if any. */
export function marketCountHit(asOf: Date, years: number = EIGHTY_FOUR_YEARS): MarketCountHit | null {
  const [y, m] = etDateKey(asOf).split("-").map(Number);
  const target = `${y - years}-${String(m).padStart(2, "0")}`;
  const hit = marketAnchors().find((a) => a.month === target);
  return hit ? { years, kind: hit.kind, pivotMonth: hit.month } : null;
}

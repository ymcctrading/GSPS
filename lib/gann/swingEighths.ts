/**
 * The top and bottom eighth of a swing (A-OTHER-12, built 2026-10-22; owner:
 * "Build the 11 that can be filled with a labelled reconstruction").
 *
 * Source, as reported (W001 pp. 1-2, the 1909 *Ticker* interview): Gann
 * "works out the trend in advance" from the top or bottom of a swing to the
 * turning point, and his orders went in at the top or bottom eighth of the
 * swing. The interview reports the result, not the method that found the
 * turning point, so this is a **labelled reconstruction**, not his rule:
 * - the swing is the last completed swing of his 3-Day Chart
 *   (`swingChart.ts`), the chart his own buying points read;
 * - the eighths are that swing's range divided by 8, the division he uses
 *   for every range (Master Course Ch. 9; `rangeDivisions.ts`).
 * A long's entry in the bottom eighth (between the swing's bottom and 1/8 of
 * the range above it) or a short's in the top eighth is the reading.
 *
 * Where it acts: context only. It is a measured factor in the replay
 * (`contextFactors.ts#entryInSwingEighth`) and a line on the card, read from
 * the same daily bars on the live scan and the replay (`readDisclosedRules`).
 * It never gates: the method behind it was not disclosed.
 *
 * Three-question basis:
 * 1. Gann: W001 pp. 1-2, a contemporary's report of his trading (Tier B for
 *    the method); the eighths are his own division (Tier A).
 * 2. Cycles: no periodicity claim; Dewey does not apply.
 * 3. Hermetic: Polarity (the bottom eighth for a buy mirrors the top eighth
 *    for a sale) and Rhythm (the order goes in where the swing turns).
 */
import type { Bar } from "@/lib/types";
import { THREE_DAY_CHART, walkSwingChart } from "@/lib/gann/swingChart";

export interface SwingEighthsReading {
  top: number;
  bottom: number;
  /** The bottom's eighth: bottom + (top - bottom) / 8. */
  bottomEighth: number;
  /** The top's eighth: top - (top - bottom) / 8. */
  topEighth: number;
  /** Which eighth the price read with it sits in, if either. */
  at: "bottomEighth" | "topEighth" | null;
}

/** The last completed 3-Day Chart swing and its top and bottom eighths, or null. */
export function readSwingEighths(daily: Bar[], price: number | null = null): SwingEighthsReading | null {
  const pivots = walkSwingChart(daily, THREE_DAY_CHART).pivots;
  if (pivots.length < 2) return null;
  const a = pivots[pivots.length - 1];
  const b = pivots[pivots.length - 2];
  if (a.kind === b.kind) return null;
  const top = Math.max(a.price, b.price);
  const bottom = Math.min(a.price, b.price);
  if (!(top > bottom) || !(bottom > 0)) return null;
  const eighth = (top - bottom) / 8;
  const r: SwingEighthsReading = { top, bottom, bottomEighth: bottom + eighth, topEighth: top - eighth, at: null };
  if (price !== null) r.at = inSwingEighth(r, "bullish", price) ? "bottomEighth" : inSwingEighth(r, "bearish", price) ? "topEighth" : null;
  return r;
}

/** Whether `price` sits in the eighth a trade in `direction` is ordered at. */
export function inSwingEighth(r: SwingEighthsReading | null | undefined, direction: "bullish" | "bearish", price: number): boolean {
  if (!r || !Number.isFinite(price)) return false;
  return direction === "bullish" ? price >= r.bottom && price <= r.bottomEighth : price <= r.top && price >= r.topEighth;
}

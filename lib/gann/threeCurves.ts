/**
 * A-TIME-13, Gann's three curves: "The swings in the Stock market are based
 * upon a Time factor and my calculations are based upon the commodity curve,
 * money curve and curve of stocks. Sometimes one of these curves will cause a
 * change of trend" (1922 annual forecast, W036 p.13; the same words in W031).
 * He never shows how a curve is drawn, so this is a labelled reconstruction.
 *
 * Built: each curve is read the way his disclosed curve of stocks is, by laying
 * the decades back over the month (`massPressure.ts#readCurve`): the curve of
 * stocks on the S&P composite, the money curve on the long-term interest rate
 * and the commodity curve on the consumer price index, all from Shiller's
 * record (`marketHistory.json`). Where the money or commodity curve runs
 * against the curve of stocks, one of them may "cause a change of trend":
 * recorded as the context factor `curvesDisagree`, measured, never acting.
 *
 * Engineering choices, labelled: the long-term rate stands in for money and
 * the consumer price index for commodities (Gann names neither series); the
 * curves are compared by direction only.
 *
 * Three-question basis:
 * 1. Gann: Tier A for the statement; the construction is not his (none survives).
 * 2. Cycles: the cross-series clustering item of Dewey's checklist is the
 *    question this asks; it is not cleared, so context only.
 * 3. Hermetic: Correspondence and Cause and Effect, the money and goods
 *    markets read beside the stock market they act on.
 */
import { readCurve } from "@/lib/gann/massPressure";

type Direction = "bullish" | "bearish" | null;

export interface ThreeCurvesReading {
  stocks: Direction;
  money: Direction;
  commodity: Direction;
  /** The money or the commodity curve runs against the curve of stocks. */
  disagree: boolean;
}

export function readThreeCurves(asOf: Date): ThreeCurvesReading | null {
  const stocks = readCurve("stocks", asOf)?.direction ?? null;
  if (stocks === null) return null;
  const money = readCurve("rate", asOf)?.direction ?? null;
  const commodity = readCurve("cpi", asOf)?.direction ?? null;
  const against = (d: Direction) => d !== null && d !== stocks;
  return { stocks, money, commodity, disagree: against(money) || against(commodity) };
}

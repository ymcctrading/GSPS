/**
 * A-OTHER-06, Gann's Dollar Trend: the trend of the total market value of the
 * stocks listed, read on its monthly chart. "Buy when the value crosses old
 * highs; sell when it breaks old lows", and he held it "much more accurate …
 * than the Dow-Jones 30" (*Speculation a Profitable Profession*, 1954, the
 * course's Ch. 1, PDF 20-24 and 29-31, per the W023 reading notes).
 *
 * Built: the market's monthly chart (`marketMonthly`, SPY's months with the
 * month in progress built from its completed sessions, as `campaignLength.ts`
 * reads it, so the chart can turn on an unfinished month, the same on both
 * surfaces), its
 * trend turning on crossing the last completed swing top or breaking the last
 * swing bottom, the 3-bar swing chart read on months. Context and a measured
 * factor (`dollarTrendWithTrade`); nothing here moves a score, gate, plan or
 * order.
 *
 * Engineering choices, labelled: SPY stands in for the NYSE's total market
 * value (both weight each company by its value; GSPS holds no exchange-wide
 * total), and the 3-bar chart is the "old highs" and "old lows" Gann names.
 *
 * Three-question basis:
 * 1. Gann: Tier A (his 1954 course), as cited.
 * 2. Cycles: no periodicity claim; Dewey's checklist does not apply.
 * 3. Hermetic: Correspondence, the whole market's value read as one chart, as
 *    the stock is read.
 */
import { swingChartDirection, THREE_DAY_CHART, type SwingDirection } from "@/lib/gann/swingChart";
import type { Bar } from "@/lib/types";

export interface DollarTrendReading {
  direction: SwingDirection;
}

export function readDollarTrend(marketMonthly: Bar[] | null | undefined): DollarTrendReading | null {
  if (!marketMonthly || marketMonthly.length < 6) return null;
  return { direction: swingChartDirection(marketMonthly, THREE_DAY_CHART) };
}

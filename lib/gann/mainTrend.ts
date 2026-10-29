/**
 * The stock's main trend on its monthly chart, and the short sale it permits
 * (2026-10-29, owner: "Correct" to holding a short unless the stock's own
 * monthly chart reads down).
 *
 * Gann's text:
 * - The monthly high-low chart is "the most important chart of all in
 *   determining the main trend" (Master Course GA-2/3, A2.1); daily is the
 *   first indication, weekly next, monthly of greatest importance for changes
 *   in the main trend (A2.1; the 1953-54 chart order, A12).
 * - The main trend turns down on the monthly swing: "after a sharp break of
 *   2-3 days/weeks/months, a rally, then a break under the first sharp break's
 *   low, the main trend is down" (Master Course GA-12..16, A2.1). That is
 *   the swing chart turning on a break of its last swing bottom.
 * - He does not sell short while it is up: Vanadium, sold at 59¾ on the 50%
 *   point and record volume, "but don't short since main trend still up"
 *   (Master Course Ch. 1, 1954, pp. 22-24, A2.1); "never buck the trend" (the 24
 *   never-failing rules); the sale is the secondary rally after the main trend
 *   has turned down (Sell 3, Master Course Ch. 8, 1939, pp. 241-245).
 *
 * Read here as Gann's monthly swing chart on closed months: a move counts as
 * months "without breaking the previous month's low or high" (*Commodities*
 * pp. 102-103), the 7-day chart's construction on bars that each span it
 * (`swingChart.ts`, rule recheck fix 1), and the trend turns on crossing the
 * last swing top or breaking the last swing bottom, "the point from which the
 * last run-up to the top began" (NSTD pp. 19-20, A05). One reading, shared with the core
 * replay profile.
 *
 * Only the short is held. Gann's text forbids the short against a rising main
 * trend; it buys the turn at an old bottom before the monthly chart turns (the
 * double bottom, W006 Rule 1 p. 46), so the long is not mirrored. The six-year
 * rerun of 2026-10-29 agrees with that asymmetry (shorts -0.079R over 30,002
 * trades, longs +0.036R; `replay-diagnosis/2026-10-29-averages-trend-rerun`).
 *
 * Three lenses: Gann as above (Tier A); no periodicity claim, so Dewey's
 * checklist does not apply; Correspondence (the part follows the whole of its
 * own record: the day's sale conforms to the month's trend).
 */

import type { Bar } from "@/lib/types";
import { swingChartDirection, WEEKLY_SWING_CHART } from "@/lib/gann/swingChart";

type Side = "bullish" | "bearish";

/** Closed months the monthly swing chart needs before it reads a main trend. */
export const MIN_MAIN_TREND_MONTHS = 6;

/** The main trend on the stock's closed months, or null on too short a record. */
export function readMonthlyMainTrend(closedMonths: Bar[]): Side | null {
  if (closedMonths.length < MIN_MAIN_TREND_MONTHS) return null;
  return swingChartDirection(closedMonths, WEEKLY_SWING_CHART) ?? null;
}

/** A short is permitted only once the main trend reads down; an unread trend permits none. */
export function shortAgainstMainTrend(mainTrend: Side | null | undefined, side: Side | "none"): boolean {
  return side === "bearish" && mainTrend !== "bearish";
}

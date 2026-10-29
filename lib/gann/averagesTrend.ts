/**
 * The averages' trend, read as Gann's 1949 Rule 1 reads it: "determine the
 * trend of the averages (or the group) with the 3-Day Chart and the 9-Point
 * Swing Chart, and trade stocks that conform" (*45 Years in Wall Street*,
 * Ch. II p. 6, source note A09). The swing chart is the 7-day weekly chart
 * since B1 (2026-09-27, `swingChart.ts`); SPY stands in for the averages.
 *
 * Until 2026-10-29 the market's trend was `readGannTrend`, which also needs the
 * 3-Day Chart's tops and bottoms stepping the weekly chart's way (an
 * engineering choice, labelled in `trendStrength.ts`). On SPY it read "no
 * trend" on 78% of the 2022 bear market's sessions and 88% of the 2025 decline,
 * while the two charts read down (2022: 58% each; 2025: 3-Day 74%, weekly 88%;
 * `replay-diagnosis/2026-10-29-six-year-rerun/LONGS-VS-SHORTS.md`), so Rule 1
 * never acted on a long, and longs bought in the four selloff windows lost more
 * than the whole six-year run.
 *
 * Two readings come from it:
 * - **The main trend** is the weekly chart's. The 3-Day Chart's turns inside it
 *   are the reactions Gann buys in a bull market and sells in a bear market
 *   ("stocks are a buy on a reaction of about 1 month in a bull market", Master
 *   Course p. 10, rule A). P1's market leg reads it.
 * - **Against the trade** when both charts read against it: Rule 1's two charts
 *   agree on the averages' trend. A long is then a stock that does not conform
 *   ("don't buck the trend", the 24 never-failing rules, p. 15), and a short in
 *   a market both charts read up likewise (Rule 1 is symmetric). When the
 *   charts disagree (a reaction in the main trend, or the averages' first turn
 *   against it) the stock's own charts decide, as before.
 *
 * Weighed against the *New Stock Trend Detector* (1936, Ch. IV, A05): "apply
 * the trend rules to each stock; do not trade from the averages", and late
 * movers top after the averages, so don't short a stock because the average
 * turned. The hold never takes a side from the averages: the stock's own
 * charts still choose it, and a late mover can still read its own trend. The
 * 1949 book is the later one and states Rule 1 first, so where the two differ
 * on a stock against a falling (rising) market, it decides.
 *
 * Designed through the three lenses (AGENTS.md):
 * 1. Gann: 45 Years Rule 1 (Tier A), the never-failing rules, Master Course
 *    p. 10; NSTD Ch. IV weighed.
 * 2. Cycles: no periodicity claim; it reads the charts' current state.
 * 3. Hermetic: Correspondence (the whole market and its stocks move as one,
 *    the part conforming to the whole) and Polarity (the short mirrors the long).
 */

import type { Bar } from "@/lib/types";
import { computeSwingChart } from "@/lib/gann/swingChart";

type Side = "bullish" | "bearish";

export interface AveragesTrend {
  /** The averages' 3-Day Chart trend. */
  threeDay: Side | null;
  /** The averages' 7-day weekly chart trend: the main trend. */
  weekly: Side | null;
}

/** Bars the swing charts need before they read anything (the 7-day chart's first swings). */
export const MIN_AVERAGES_BARS = 10;

/** The averages' two charts, on completed sessions the caller has already cut. */
export function readAveragesTrend(market: Bar[]): AveragesTrend | null {
  if (market.length < MIN_AVERAGES_BARS) return null;
  const { threeDay, weekly } = computeSwingChart(market);
  return { threeDay: threeDay ?? null, weekly: weekly ?? null };
}

/** Both of Rule 1's charts read against the trade's side. */
export function averagesAgainst(a: AveragesTrend | null | undefined, side: Side): boolean {
  if (!a) return false;
  const against: Side = side === "bullish" ? "bearish" : "bullish";
  return a.threeDay === against && a.weekly === against;
}

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
 * never acted on a long. (Longs bought in the four selloff windows lost more
 * than the whole six-year run; over the whole run the drag was the shorts,
 * below.)
 *
 * The main trend is the weekly chart's; the 3-Day Chart's turns inside it are
 * the reactions Gann buys in a bull market and sells in a bear market ("stocks
 * are a buy on a reaction of about 1 month in a bull market", Master Course
 * p. 10, rule A). P1's market leg reads it.
 *
 * Taken out, 2026-10-29: a hold of any Execute when both charts read against it
 * (`averagesAgainst`, removed). The six-year rerun measured it holding the best longs
 * (+0.101R with both charts down) and passing the worst shorts, since both
 * charts turn only once most of a decline is done
 * (`replay-diagnosis/2026-10-29-averages-trend-rerun/FINDINGS.md`). The short
 * is now held on the stock's own monthly main trend (`mainTrend.ts`).
 *
 * Weighed against the *New Stock Trend Detector* (1936, Ch. IV, A05): "apply
 * the trend rules to each stock; do not trade from the averages", and late
 * movers top after the averages, so don't short a stock because the average
 * turned. The averages never choose a stock's side here.
 *
 * Designed through the three lenses (AGENTS.md):
 * 1. Gann: 45 Years Rule 1 (Tier A), the never-failing rules, Master Course
 *    p. 10; NSTD Ch. IV weighed.
 * 2. Cycles: no periodicity claim; it reads the charts' current state.
 * 3. Hermetic: Correspondence (the whole market and its stocks move as one,
 *    the part conforming to the whole).
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

/**
 * The span the charts are walked over, back from the last session read. The
 * swing charts walk from their first bar, so every surface reads the same span:
 * the live scan holds about 400 calendar days of SPY (`getMarketDailyBars`), a
 * replay its whole run. A year sits inside both. Engineering choice, labelled.
 */
export const AVERAGES_WINDOW_DAYS = 365;

/** The averages' two charts, on completed sessions the caller has already cut. */
export function readAveragesTrend(market: Bar[]): AveragesTrend | null {
  const last = market[market.length - 1];
  if (!last) return null;
  const from = Date.parse(last.t) - AVERAGES_WINDOW_DAYS * 86_400_000;
  const span = Date.parse(market[0].t) >= from ? market : market.filter((b) => Date.parse(b.t) >= from);
  if (span.length < MIN_AVERAGES_BARS) return null;
  const { threeDay, weekly } = computeSwingChart(span);
  return { threeDay: threeDay ?? null, weekly: weekly ?? null };
}

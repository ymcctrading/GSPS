/**
 * Gann's Rule 8 of the Overnight method (*Master Stock Market Course*, Ch. 3;
 * Tier A): "when an active stock closes for 3 days, 3 weeks or 3 months around
 * the same price", and then the trend changes, "it usually goes a considerable
 * distance in the new direction." Built 2026-10-16 at the project owner's
 * request.
 *
 * The reading, on daily, weekly and monthly bars alike: the latest run of
 * three consecutive closes within one point of each other, and whether a later
 * close has left the three bars' range, and which way. Context only, on the
 * live scan and the replay (`disclosedRules.ts`), measured through
 * `contextFactors.ts`. Nothing here gates a verdict.
 *
 * Engineering choices, labelled as such: "around the same price" is a spread
 * of the three closes of one of Gann's points (a third of his price-scaled
 * 3 points, `overnightChart.ts#gannPoint`); the break is a close beyond the
 * three bars' high or low; a cluster counts only if it ended within the last
 * `RECENT_BARS` bars of its timeframe, since an old one has already had its
 * move. `accumulation.ts` reads the related rule on time in a range; this one
 * is the close-for-close version Gann states separately.
 *
 * Three-question basis:
 * 1. Gann: as cited.
 * 2. Cycles: no periodicity claim. Dewey's checklist does not apply.
 * 3. Hermetic: Correspondence (the same rule on days, weeks and months, as
 *    Gann states it) and Cause and Effect (the balance at one price is the
 *    cause, the distance travelled after it the effect).
 */

import type { Bar } from "@/lib/types";
import { gannPoint } from "@/lib/gann/overnightChart";

export const CLUSTER_CLOSES = 3;
export const RECENT_BARS = { daily: 5, weekly: 3, monthly: 2 } as const;

export type ClusterTimeframe = keyof typeof RECENT_BARS;

export interface CloseClusterReading {
  timeframe: ClusterTimeframe;
  /** The average of the three closes. */
  price: number;
  high: number;
  low: number;
  /** Bars since the cluster's last close (0 = it ended on the latest bar). */
  barsSince: number;
  /** The first later close beyond the three bars' range, if any. */
  breakout: "up" | "down" | null;
}

export function readCloseCluster(bars: Bar[], timeframe: ClusterTimeframe): CloseClusterReading | null {
  const last = bars.length - 1;
  for (let end = last; end >= Math.max(CLUSTER_CLOSES - 1, last - RECENT_BARS[timeframe]); end--) {
    const run = bars.slice(end - CLUSTER_CLOSES + 1, end + 1);
    const closes = run.map((b) => b.c);
    const mid = closes.reduce((s, c) => s + c, 0) / closes.length;
    if (Math.max(...closes) - Math.min(...closes) > gannPoint(mid)) continue;
    const high = Math.max(...run.map((b) => b.h));
    const low = Math.min(...run.map((b) => b.l));
    let breakout: CloseClusterReading["breakout"] = null;
    for (let k = end + 1; k <= last; k++) {
      if (bars[k].c > high) { breakout = "up"; break; }
      if (bars[k].c < low) { breakout = "down"; break; }
    }
    return { timeframe, price: mid, high, low, barsSince: last - end, breakout };
  }
  return null;
}

export function describeCloseCluster(r: CloseClusterReading): string {
  const unit = { daily: "days", weekly: "weeks", monthly: "months" }[r.timeframe];
  return `Closed 3 ${unit} around ${r.price.toFixed(2)}${r.breakout ? `, then broke ${r.breakout}: the method expects a considerable move that way` : ": a break of the range is usually followed by a considerable move"}.`;
}

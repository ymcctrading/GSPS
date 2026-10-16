/**
 * The first return to the 50% point (C-ENTRY-04). A compiler of Gann's
 * teaching (W003 pp.20-21, class C): "1/2 is the most important level, the
 * centre of gravity"; after price breaks below the halfway point of an
 * advance, its first rally back to that point is a short. The mirror buys the
 * first reaction back to the halfway point of a decline price has broken
 * above.
 *
 * Context only, measured (`contextFactors.ts`, `halfwayReturnAgrees`), never a
 * gate or an order: the rule comes from the compiler, not from a text of
 * Gann's own, so AGENTS.md keeps it out of the verdict until a source of his
 * own or a measured result says otherwise. Gann's own ranking of 50% first
 * among retracement levels is in `retracement.ts`.
 *
 * Reading choices, labelled as such: the move is a completed 3-Day Chart swing
 * (bottom to top, or top to bottom), the latest whose halfway point a later
 * close has gone through; the break is a close beyond the point, and a return
 * is a later session trading back to it.
 *
 * Three-question basis: 1. Class C (W003), not Gann's own text. 2. No claim
 * about periodicity. 3. Polarity (the halfway point divides the move, and the
 * rule mirrors) and Correspondence (the same point on any swing).
 */
import type { Bar } from "@/lib/types";
import { SWING_CHART_DAYS, swingPivots } from "@/lib/gann/swingChart";

export interface HalfwayRetestReading {
  /** The trade the return offers: bearish after an advance's halfway point breaks. */
  direction: "bullish" | "bearish";
  /** The halfway point of the swing. */
  level: number;
  /** `broken`: no return yet; `returning`: the last session is the first return; `spent`: an earlier one was. */
  state: "broken" | "returning" | "spent";
}

export function readHalfwayRetest(bars: Bar[]): HalfwayRetestReading | null {
  const pivots = swingPivots(bars, SWING_CHART_DAYS.threeDay);
  for (let k = pivots.length - 1; k >= 1; k--) {
    const end = pivots[k];
    const start = pivots[k - 1];
    if (end.kind === start.kind) continue;
    const level = (end.price + start.price) / 2;
    // An advance (ending at a top) is broken by a close under its halfway point.
    const sign = end.kind === "top" ? 1 : -1;
    let broke = -1;
    for (let i = end.index + 1; i < bars.length; i++) {
      if (sign * (bars[i].c - level) < 0) {
        broke = i;
        break;
      }
    }
    if (broke < 0) continue;
    const returns: number[] = [];
    for (let i = broke + 1; i < bars.length; i++) {
      if (sign === 1 ? bars[i].h >= level : bars[i].l <= level) returns.push(i);
    }
    const state = returns.length === 0 ? "broken" : returns[0] === bars.length - 1 ? "returning" : "spent";
    return { direction: sign === 1 ? "bearish" : "bullish", level, state };
  }
  return null;
}

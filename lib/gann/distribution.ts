/**
 * Gann's volume Rule 2: after a second, lower top, a dull, narrow sideways
 * spell that breaks out downward on increased volume signals a further
 * decline (A-VOLUME-03; W006 pp.39-40, Ch. VI "Rules for culminations by
 * volume"; Master Course Ch.12 Rule 2). Context only for now: the action the
 * rule implies (hold a long, exit a long) waits on fork FV7.
 *
 * The reading, on completed sessions only (the session still trading on the
 * live scan is never read, so the live scan and the replay see the same
 * sessions):
 * - the lower top: the last two completed tops of the weekly (7-day) swing
 *   chart, the later one lower;
 * - the spell and its break: `readAccumulation` on those sessions, broken
 *   down (its range is the 20 sessions before the last one, its break the
 *   3-point allowance);
 * - increased volume: the breaking session's volume over the mean volume of
 *   the range's sessions, above 1.
 *
 * Engineering choices, labelled: "increased" is read as above the range's
 * own mean session volume; the lower top only has to come before the break
 * (Gann gives no spacing); only the last `SESSIONS_READ` completed sessions
 * are walked, the live scan's year of daily bars, which also bounds the cost
 * on the replay's longer history (the recent tops are the same either way,
 * pinned in the tests).
 *
 * Three-question basis:
 * 1. Gann: W006 pp.39-40 (class A), the Master Course corroborating.
 * 2. Cycles: no periodicity claim; Dewey does not apply.
 * 3. Hermetic: Cause and Effect (supply returning on the break is the cause,
 *    the further decline its effect) and Polarity (the bottom mirror is
 *    Rule 4, a separate rule, so none is invented here).
 */
import type { Bar } from "@/lib/types";
import { etDateKey } from "@/lib/market/session";
import { readAccumulation, RANGE_LOOKBACK } from "@/lib/gann/accumulation";
import { WEEKLY_SWING_CHART, walkSwingChart } from "@/lib/gann/swingChart";

/** Completed sessions read: a year, the live scan's daily span (and a bound on the walk's cost). */
export const SESSIONS_READ = 252;

export interface DistributionReading {
  /** The last two completed weekly-chart tops, the later one lower. */
  afterLowerTop: boolean;
  /** The last completed session closed below the spell's range by the 3-point allowance. */
  brokeDown: boolean;
  /** The breaking session's volume over the range sessions' mean volume. */
  breakoutVolumeRatio: number;
  /** All three: Gann's Rule 2 signal of a further decline. */
  distributionBreakdown: boolean;
}

export function readDistributionBreakdown(daily: Bar[], asOf: Date): DistributionReading | null {
  const today = etDateKey(asOf);
  // Only the last bar or two can be today's; dropping them from the end keeps
  // the date formatting off every bar of a long replay history.
  let end = daily.length;
  while (end > 0 && etDateKey(new Date(daily[end - 1].t)) >= today) end--;
  const done = daily.slice(Math.max(0, end - SESSIONS_READ), end);
  const acc = readAccumulation(done);
  if (!acc) return null;
  const last = done[done.length - 1];
  const range = done.slice(-RANGE_LOOKBACK - 1, -1);
  const mean = range.reduce((s, b) => s + b.v, 0) / range.length;
  if (!(mean > 0)) return null;
  const tops = walkSwingChart(done, WEEKLY_SWING_CHART).pivots.filter((p) => p.kind === "top");
  const [first, second] = tops.slice(-2);
  const afterLowerTop = !!first && !!second && second.price < first.price;
  const brokeDown = acc.breakout === "down";
  const breakoutVolumeRatio = last.v / mean;
  return {
    afterLowerTop,
    brokeDown,
    breakoutVolumeRatio,
    distributionBreakdown: afterLowerTop && brokeDown && breakoutVolumeRatio > 1,
  };
}

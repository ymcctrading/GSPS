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
 * - narrow: the spell's high-to-low span is no wider than twice the 3-point
 *   allowance at its low (`NARROW_SPELL_ALLOWANCES`);
 * - dull: the spell's mean session volume is below the mean of the
 *   `DULL_BASELINE_SESSIONS` sessions before it;
 * - increased volume: the breaking session's volume over the mean volume of
 *   the range's sessions, above 1.
 *
 * Engineering choices, labelled: "narrow" as twice Gann's price-scaled 3
 * points and "dull" as quieter than the sessions before (Gann gives neither a
 * width nor a volume figure for the spell; added 2026-10-16 after review M1,
 * before which a spell of any width counted); "increased" is read as above the range's
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
import { threePoints } from "@/lib/gann/pointScale";
import { WEEKLY_SWING_CHART, walkSwingChart } from "@/lib/gann/swingChart";

/**
 * Completed sessions read: inside the live scan's year of daily bars (about
 * 250) with room for the standing look-back (`STANDING_SESSIONS`), so a
 * breakdown 20 sessions old is read over the same 220 sessions live and in the
 * replay; also a bound on the walk's cost.
 */
export const SESSIONS_READ = 220;

/** A narrow spell spans at most this many 3-point allowances (an engineering figure, labelled above). */
export const NARROW_SPELL_ALLOWANCES = 2;
/** The sessions before the spell its volume is compared with ("dull"). */
export const DULL_BASELINE_SESSIONS = 40;

export interface DistributionReading {
  /** The last two completed weekly-chart tops, the later one lower. */
  afterLowerTop: boolean;
  /** The last completed session closed below the spell's range by the 3-point allowance. */
  brokeDown: boolean;
  /** The spell's span is within `NARROW_SPELL_ALLOWANCES` 3-point allowances. */
  narrow: boolean;
  /** The spell traded less, on average, than the sessions before it. */
  dull: boolean;
  /** The breaking session's volume over the range sessions' mean volume. */
  breakoutVolumeRatio: number;
  /** All of them: Gann's Rule 2 signal of a further decline. */
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
  const narrow = acc.rangeHigh - acc.rangeLow <= NARROW_SPELL_ALLOWANCES * threePoints(acc.rangeLow);
  const before = done.slice(-RANGE_LOOKBACK - 1 - DULL_BASELINE_SESSIONS, -RANGE_LOOKBACK - 1);
  const beforeMean = before.reduce((s, b) => s + b.v, 0) / Math.max(1, before.length);
  const dull = before.length > 0 && mean < beforeMean;
  return {
    afterLowerTop,
    brokeDown,
    narrow,
    dull,
    breakoutVolumeRatio,
    distributionBreakdown: afterLowerTop && brokeDown && narrow && dull && breakoutVolumeRatio > 1,
  };
}

/** Sessions back a breakdown is looked for: the spell's own length, `RANGE_LOOKBACK` (an engineering bound). */
export const STANDING_SESSIONS = RANGE_LOOKBACK;

export interface DistributionStanding {
  /** The session that broke down, "YYYY-MM-DD" in New York. */
  breakDate: string;
  rangeLow: number;
  breakoutVolumeRatio: number;
}

/**
 * Gann's breakdown "signals a further decline", so it stands after the session
 * that printed it: the latest breakdown in the last `STANDING_SESSIONS`
 * completed sessions, while no later close has come back up into the spell
 * (at or over its low). Engineering choices, labelled: the look-back, and
 * "back into the spell" as the end of the signal (Gann gives no expiry).
 */
export function readDistributionStanding(daily: Bar[], asOf: Date): DistributionStanding | null {
  const today = etDateKey(asOf);
  let end = daily.length;
  while (end > 0 && etDateKey(new Date(daily[end - 1].t)) >= today) end--;
  const done = daily.slice(Math.max(0, end - SESSIONS_READ - STANDING_SESSIONS), end);
  for (let k = done.length - 1; k >= Math.max(0, done.length - STANDING_SESSIONS); k--) {
    const upTo = done.slice(0, k + 1);
    const acc = readAccumulation(upTo.slice(-SESSIONS_READ));
    // The full reading only where the session broke down at all.
    if (acc?.breakout !== "down") continue;
    const breakDate = etDateKey(new Date(done[k].t));
    const r = readDistributionBreakdown(upTo, new Date(Date.parse(done[k].t) + 86_400_000 + 12 * 3_600_000));
    if (!r?.distributionBreakdown) continue;
    // Back into the spell: the breakdown no longer stands.
    if (done.slice(k + 1).some((b) => b.c >= acc.rangeLow)) return null;
    return { breakDate, rangeLow: acc.rangeLow, breakoutVolumeRatio: r.breakoutVolumeRatio };
  }
  return null;
}

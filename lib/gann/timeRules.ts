/**
 * Gann's daily and weekly time rules (parity roadmap, "Daily/weekly time
 * rules"; *Wall Street Stock Selector* Ch. IV and *45 Years in Wall Street*
 * Rule 4, Tier A). `boilingPoint.ts` already carries the 6th–7th week that
 * ends fast moves; this adds the rest of the same clock:
 *
 * - **Daily rule:** at a top or bottom the market halts for two or three days;
 *   after the halt, the stop goes 3 points beyond it (the lost-motion
 *   allowance, price-scaled).
 * - **Weekly rule:** buy two-to-three-week reactions in an uptrend (sell the
 *   rallies in a downtrend); active stocks seldom react more than three or
 *   four weeks; watch the third week, when a reaction usually ends.
 *
 * Engineering choices, labelled as such: a halt is the 20-session extreme made
 * 2 or 3 sessions ago with no session since exceeding it; the week of a
 * reaction is counted in calendar days from its start (the 3-Day Chart
 * pivot), with "2–3 weeks" read as days 8–21 and "abnormal" as over 28 days.
 *
 * Three-question basis:
 * 1. Gann: as cited, Tier A.
 * 2. Cycles: durations of reactions within a campaign; Gann gives the
 *    lengths from observation, not as a periodic cycle, so Dewey does not
 *    apply. The replay's factor table is the test.
 * 3. Hermetic: Rhythm (a reaction has a normal length, and a longer one breaks
 *    the rhythm of the trend) and Polarity (each rule mirrored for the other
 *    side).
 */

import type { Bar } from "@/lib/types";
import { LOST_MOTION_BUFFER_PCT } from "@/lib/gann/entryTrigger";
import type { CounterMoveReading } from "@/lib/gann/disclosedRules";

export const HALT_LOOKBACK = 20;

export interface TimeRulesReading {
  /** A 2–3-day halt at a fresh top (bottom), and where the stop goes beyond it. */
  halt: { at: "top" | "bottom"; days: 2 | 3; extreme: number; stop: number } | null;
  /** The current reaction against the weekly trend, in weeks, when there is one. */
  reactionWeek: number | null;
  /** 2–3 weeks: Gann's buying (selling) zone for a reaction. */
  reactionInZone: boolean;
  /** The third week, when a reaction usually ends. */
  thirdWeek: boolean;
  /** Over four weeks: abnormal for an active stock. */
  reactionAbnormal: boolean;
}

export function readTimeRules(daily: Bar[], counterMove: CounterMoveReading | null): TimeRulesReading {
  const out: TimeRulesReading = { halt: null, reactionWeek: null, reactionInZone: false, thirdWeek: false, reactionAbnormal: false };
  if (daily.length >= HALT_LOOKBACK + 3) {
    const window = daily.slice(-HALT_LOOKBACK);
    const a = LOST_MOTION_BUFFER_PCT / 100;
    for (const at of ["top", "bottom"] as const) {
      let idx = 0;
      for (let i = 1; i < window.length; i++) {
        if (at === "top" ? window[i].h >= window[idx].h : window[i].l <= window[idx].l) idx = i;
      }
      const days = window.length - 1 - idx;
      if (days === 2 || days === 3) {
        const extreme = at === "top" ? window[idx].h : window[idx].l;
        out.halt = { at, days, extreme, stop: at === "top" ? extreme * (1 + a) : extreme * (1 - a) };
        break;
      }
    }
  }
  if (counterMove?.inCounterMove) {
    const d = counterMove.days;
    out.reactionWeek = Math.floor(d / 7) + 1;
    out.reactionInZone = d >= 8 && d <= 21;
    out.thirdWeek = d >= 14 && d <= 21;
    out.reactionAbnormal = d > 28;
  }
  return out;
}

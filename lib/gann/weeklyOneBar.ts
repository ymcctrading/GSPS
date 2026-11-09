/**
 * Gann's weekly trend line, the one-week swing chart (M-R8).
 *
 * Rules, both Tier A (Master Stock Market Course, A2.1; source note
 * `docs/memory-bank/sources/A2_1_master_stock_market_course.md`):
 * - Ch. 8 (1939, p. 239), the green and red trend line: the first week with a
 *   higher bottom **and** a higher top than the week before turns the line
 *   green and moves it up to that week's high; it keeps moving up to each
 *   week's high. The first week with a lower bottom than the week before turns
 *   it red and moves it down to that week's low; it keeps moving down while
 *   lower bottoms continue. "Buy when the red trend line changes to green;
 *   sell when the green trend line changes to red."
 * - Ch. 18, the weekly swing chart: move the line up to the top of each week;
 *   "the first time the low of the previous week is broken, move the swing
 *   line down"; the first week with a higher bottom and a higher top moves it
 *   up again.
 *
 * The chart is asymmetric, and that is the rule: a down-turn needs only a
 * broken weekly low, an up-turn needs a higher top and a higher bottom. It is
 * a different construction from `swingChart.ts#WEEKLY_SWING_CHART` (the 1951
 * Commodities chart, counter-moves of 7 calendar days or more on daily bars),
 * which stays as it is: both are Gann's and neither replaces the other.
 *
 * Engineering choices, labelled:
 * - Weeks are `disclosedRules.ts#toWeeklyBars`'s (Monday-keyed). The week in
 *   progress is read as it stands, since Gann's turn is "the first time the
 *   low of the previous week is broken", which happens inside a week.
 * - Before the first turn the line has no colour (null).
 * - A week that breaks the prior low and also makes a higher top (an outside
 *   week) turns the line red: the down rule asks only for the broken low.
 *
 * Placement: a reading on the setup card and a measured context factor
 * (`contextFactors.ts#weeklyOneBarWithTrade`), read the same way on the live
 * scan and the replay through `readDisclosedRules`. Since 2026-10-21 it is
 * also the weekly leg of the score's trend pillar (P2,
 * `pillars.ts#trendPillar`), the chart Gann's "on the weekly, buy when the
 * line turns green" names. Whether it should join or replace the 7-day chart
 * where the exits and the campaign ledger read the weekly trend is the
 * owner's call, held with the review B notes.
 *
 * Three-question basis:
 * 1. Gann: as cited above, Tier A.
 * 2. Cycles: no periodicity claim; one week is a filter on swings, not a
 *    period. Dewey's checklist does not apply.
 * 3. Hermetic: Polarity, read as Gann wrote it, unequal: the market is
 *    quicker to fall than to rise, so the chart turns down on less evidence
 *    than it turns up. Rhythm for the line following each week's swing.
 */

import type { Bar } from "@/lib/types";

export type WeeklyLineColour = "green" | "red";

export interface WeeklyOneBarReading {
  /** The line's colour now; null before its first turn. */
  colour: WeeklyLineColour | null;
  /** Where the line stands: the high of the last green week moved to, or the low of the last red one. Null before the first turn. */
  line: number | null;
  /** Every turn, oldest first: the week's index and the colour it turned to. */
  turns: { index: number; week: string; to: WeeklyLineColour }[];
  /** The last week turned the line ("buy" on red to green, "sell" on green to red). */
  turnedThisWeek: boolean;
}

/** Walks completed (and the forming) weekly bars, oldest first. */
export function walkWeeklyOneBar(weeks: Bar[]): WeeklyOneBarReading {
  let colour: WeeklyLineColour | null = null;
  let line: number | null = null;
  const turns: WeeklyOneBarReading["turns"] = [];
  for (let i = 1; i < weeks.length; i++) {
    const w = weeks[i];
    const prev = weeks[i - 1];
    const lowerBottom = w.l < prev.l;
    const higherUp = w.h > prev.h && w.l > prev.l;
    if (lowerBottom) {
      if (colour !== "red") turns.push({ index: i, week: w.t.slice(0, 10), to: "red" });
      colour = "red";
      line = w.l;
    } else if (higherUp) {
      if (colour !== "green") turns.push({ index: i, week: w.t.slice(0, 10), to: "green" });
      colour = "green";
      line = w.h;
    } else if (colour === "green" && w.h > (line ?? Infinity)) {
      // Green: the line follows each week's top.
      line = w.h;
    }
  }
  const last = turns[turns.length - 1];
  return { colour, line, turns, turnedThisWeek: last !== undefined && last.index === weeks.length - 1 };
}

export function describeWeeklyOneBar(r: WeeklyOneBarReading): string | null {
  if (r.colour === null || r.line === null) return null;
  const last = r.turns[r.turns.length - 1];
  const turned = r.turnedThisWeek
    ? r.colour === "green"
      ? " It turned green this week: the weekly buy signal."
      : " It turned red this week: the weekly sell signal."
    : ` It has been ${r.colour} since the week of ${last.week}.`;
  return `Weekly trend line: ${r.colour}, at ${r.line.toFixed(2)}.${turned} It turns red on the first broken weekly low, and green only on a week with a higher top and a higher bottom.`;
}

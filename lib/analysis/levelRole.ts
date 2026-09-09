/**
 * Support/resistance role and timeframe guidance for a structural level.
 *
 * Gann's flip rule: the same line is resistance while price sits below it and
 * becomes support the moment price closes above it (and the mirror for a
 * level price falls beneath) — role depends only on which side current price
 * is on, not on how the level was built. This computes the role at read time
 * from current price rather than storing it, so a level's label never goes
 * stale as price moves through it.
 */

import type { Timeframe } from "@/lib/types";
import { EXECUTION_TIMEFRAME, TF_LABEL } from "@/lib/timeframe";

export type LevelRole = "support" | "resistance";

export function levelRole(currentPrice: number, levelPrice: number): LevelRole {
  return currentPrice >= levelPrice ? "support" : "resistance";
}

/** "Support" already reads capitalized in the UI; keep it consistent everywhere. */
export function levelRoleLabel(role: LevelRole): string {
  return role === "support" ? "Support" : "Resistance";
}

/**
 * Which timeframe a level's role is worth acting on, by the timeframe it was
 * derived from. This is the answer to "which timeframe is each level best
 * used for": higher timeframes describe context that holds for days to
 * months and are too coarse to trade off of directly; a level's own
 * timeframe is also where a break of it is worth watching — a monthly level
 * gets confirmed on daily/weekly closes, not on a 1-minute wick through it.
 * GSPS's own architecture already draws this line: macro trends (monthly/
 * weekly/daily) set context, the 1-hour trend confirms timing, and patterns
 * trigger on the execution timeframe (`EXECUTION_TIMEFRAME` in
 * lib/scanTicker.ts) — the guidance below matches that division rather than
 * inventing a new one.
 *
 * The two entries naming *which* timeframe is "the" execution one are built
 * from `EXECUTION_TIMEFRAME` rather than hardcoded, on purpose: this Record
 * used to say "15-minute execution timeframe" as a literal string, which
 * silently became false the moment the 2026-09-09 temporary override moved
 * the real execution bar to 1Hour (see that constant's own comment) — a
 * stale claim shown to users with no compiler or test to catch it. Read as
 * live copy, not restated, it cannot drift from what the scan actually does.
 */
const EXECUTION_TF_LABEL = TF_LABEL[EXECUTION_TIMEFRAME];
export const LEVEL_TIMEFRAME_USAGE: Record<Timeframe, string> = {
  "1Year": "yearly context — multi-year structure, background only, not a trade trigger",
  "1Month": "monthly context — position trades held for weeks to months",
  "1Week": "weekly context — swing trades held for several days to a few weeks",
  "1Day": `daily structure — the primary swing level structural levels are measured against; entries confirm and trigger on the ${EXECUTION_TF_LABEL} execution timeframe once price reacts`,
  "4Hour": "4-hour structure — multi-day swing confirmation",
  "2Hour": "2-hour structure — short swing / multi-session confirmation",
  "1Hour":
    EXECUTION_TIMEFRAME === "1Hour"
      ? "1-hour execution timeframe — where entries actually trigger"
      : "1-hour structure — intraday-to-swing timing confirmation ahead of entry",
  "15Min":
    EXECUTION_TIMEFRAME === "15Min"
      ? "15-minute execution timeframe — where entries actually trigger"
      : "15-minute structure — finer than the current execution timeframe",
  "5Min": "5-minute — fine-tunes an intraday entry/exit, not a standalone level",
  "1Min": "1-minute — execution noise, not reliable as a standalone level",
};

/**
 * One line describing a level: its role right now, the price, and which
 * timeframe it's meant to be used on — plus the flip it will make if price
 * closes back through it.
 */
export function describeLevel(
  currentPrice: number,
  levelPrice: number,
  timeframe: Timeframe,
  label: string,
): string {
  const role = levelRole(currentPrice, levelPrice);
  const flip = role === "support" ? "resistance" : "support";
  return (
    `${levelRoleLabel(role)} — ${label} at ${levelPrice.toFixed(2)} ` +
    `(${LEVEL_TIMEFRAME_USAGE[timeframe]}). Flips to ${flip} if price closes back through it.`
  );
}

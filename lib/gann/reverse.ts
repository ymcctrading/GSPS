/**
 * Reverse when caught (A-EXIT-02; owner's Q15, 2026-10-16: "Switch all nine").
 *
 * 1. Source. W006 p.48, Rule 6: at a change in trend, sell the longs and go
 *    short; near an old top of 75 that has held for a week or two, sell short
 *    with a stop at 78, and "if stopped, reverse again". "Keep with the trend
 *    all the time." The Overnight Chart's rule 4 says the same at the hourly
 *    scale: when the stop is caught, reverse. Tier A.
 * 2. Cycle theory. No periodicity claim; Dewey's checklist does not apply.
 * 3. Hermetic principle. Polarity: the long and the short are the two poles of
 *    one trend reading, so a reading that ends one opens the other. Rhythm:
 *    the swing that ended the trade is the start of the next one, not a pause.
 *    The others (Mentalism, Correspondence, Vibration, Cause and Effect,
 *    Gender) add nothing to the geometry here.
 *
 * The geometry is Gann's: the reversal enters at the level whose break ended
 * the trade (the stop, or the close the signal was read on) and its stop sits
 * 3 of his points beyond the old trade's extreme, the top for a long caught
 * (78 over a 75 top), price-scaled by `gannThreePoints`. No target is fixed
 * (Q14); the reversal leaves on the same exit rules as any trade.
 *
 * Which exits reverse. A stop that was hit (any of Gann's stops) and the exits
 * that say the trend has changed: a change of trend, a failed top or bottom
 * ("failing to pass an old top is a top"), and distribution at a top. The hold
 * test and three adverse closes say "you are wrong" about this entry, not that
 * the trend has turned, so they only take the trade off.
 */

import { gannThreePoints } from "./pointScale";
import type { GannExitReason, GannStopReason } from "./exitRules";

/** "stop" is any stop that was hit, when the exit manager knows no finer reason. */
export type ReversalCause = GannStopReason | GannExitReason | "stop";

const REVERSING_EXITS: ReadonlySet<GannExitReason> = new Set(["trend_change", "failed_top", "distribution"]);
const STOP_REASONS: ReadonlySet<string> = new Set<GannStopReason | "stop">([
  "stop",
  "initial",
  "break_even",
  "last_reaction",
  "prior_week",
  "prior_month",
  "final_stage",
]);

/** Whether a trade that left for this reason is reversed. */
export function reversesOn(cause: ReversalCause | "covered" | "timeout" | null | undefined): boolean {
  if (!cause) return false;
  return STOP_REASONS.has(cause) || REVERSING_EXITS.has(cause as GannExitReason);
}

export interface GannReversal {
  /** The side of the new trade: the opposite of the one caught. */
  side: "long" | "short";
  /** Where the reversal enters: the level whose break ended the trade. */
  entry: number;
  /** 3 points beyond the old trade's extreme: over the top for a short, under the bottom for a long. */
  stop: number;
}

/**
 * The reversal for a trade that was caught. `brokenLevel` is the stop that was
 * hit or the close the exit was read on; `extreme` is the best price the old
 * trade saw (its top for a long). Null when the geometry is degenerate: a stop
 * that would not sit beyond the entry.
 */
export function gannReversal(input: { side: "long" | "short"; brokenLevel: number; extreme: number }): GannReversal | null {
  const { side, brokenLevel, extreme } = input;
  if (!(brokenLevel > 0) || !(extreme > 0)) return null;
  const toShort = side === "long";
  const stop = toShort ? extreme + gannThreePoints(extreme) : extreme - gannThreePoints(extreme);
  if (toShort ? stop <= brokenLevel : stop >= brokenLevel || stop <= 0) return null;
  return { side: toShort ? "short" : "long", entry: brokenLevel, stop };
}

/**
 * Gann's pyramiding rules (parity roadmap, "pyramiding"; built 2026-09-28 by
 * project-owner direction: "if it applies to Gann's method, then yes").
 *
 * Pyramiding is adding to a winning position as the trend proves itself. What
 * Gann says (Tier A; `docs/memory-bank/sources/`):
 * - **Only add to a winner; never average a loss** ("the greatest mistake any
 *   trader can make"). Add a lot only once the last one shows the full
 *   interval of profit (*New Stock Trend Detector* Rule 5).
 * - **Add where the trend proves itself:** on each crossing of an old top (a
 *   bottom, for shorts) (*How to Make Profits in Commodities*; *45 Years in
 *   Wall Street*: "pyramid only after resistance is crossed").
 * - **Each lot smaller than the last:** "buy the largest amount first and then
 *   gradually decrease" (*Tunnel Thru the Air*, W022 p.198); the 3rd lot half
 *   the 2nd, the 4th half the 3rd (Master Course Rule 5). The owner chose this
 *   reading over *New Stock Trend Detector*'s equal lots halved after the 4th
 *   or 5th (Q9, 2026-10-16), so there is no fixed lot count: the pyramid ends
 *   when the next half-lot would be under one share.
 * - **Move the stop so the combined position can't lose** (*New Stock Trend
 *   Detector* Rule 5), with a full stop-out losing no more than 10% of capital
 *   (Master Course).
 * - **Add only once the trade has shown it is with the trend:** a profit at
 *   the first close that is still there after three days (A-TIME-12, W006
 *   p.23; `readHoldTime`). Before that, the first lot has not shown which
 *   side of the trend it is on.
 *
 * How GSPS applies it: `readPyramidAdd` says whether the position has earned
 * an add now, how large, at what trigger, and where the whole position's stop
 * goes. The Portfolio shows it as a suggestion; the replay measures it
 * (`pyramid: true`). Automated adds are not placed yet: the exit managers
 * track one entry per plan, and an add changes the position they manage. That
 * is recorded in the parity roadmap as the remaining step.
 *
 * Engineering choices, labelled as such:
 * - Gann's "full interval of profit" (3–5 or 10 points by price level) is
 *   price-scaled here as one risk unit, the same scaling the break-even rule
 *   uses (`exitRules.ts`).
 * - The add trigger is a completed 3-Day Chart top (bottom) made after the last
 *   lot, crossed by the 3-point allowance: the same Buying Point the entry
 *   uses (`entryTrigger.ts`).
 *
 * Three-question basis:
 * 1. Gann: as cited, Tier A.
 * 2. Cycles: no periodicity claim; Dewey's checklist does not apply.
 * 3. Hermetic: Cause and Effect: an add is earned by the trend's own proof
 *    (a crossed top), never by hope. Polarity: the rule is mirrored for shorts,
 *    and its opposite, averaging a loss, is what it forbids. Rhythm fits the
 *    shrinking lots: each wave of the campaign gets less new capital, as the
 *    move ages.
 */

import type { Bar } from "@/lib/types";
import { beyondByThreePoints } from "@/lib/gann/pointScale";
import { THREE_DAY_CHART, walkSwingChart } from "@/lib/gann/swingChart";
import { readHoldTime } from "@/lib/gann/exitRules";

export interface PyramidLot {
  qty: number;
  price: number;
  /** YYYY-MM-DD the lot filled. */
  date: string;
}

export interface PyramidInput {
  side: "long" | "short";
  lots: PyramidLot[];
  /** The stop protecting the whole position now. */
  stop: number;
  /** The first lot's initial stop; its distance from the first entry is the risk unit. */
  initialStop: number;
  /** Completed daily sessions, oldest first, including history before the first lot. */
  daily: Bar[];
  /** The current price. */
  price: number;
}

export interface PyramidAdd {
  qty: number;
  /** Buy (sell) stop for the add: the crossed swing level plus the allowance. */
  trigger: number;
  /** The whole position's stop after the add: never below the combined break-even. */
  newStop: number;
  note: string;
}

export interface PyramidReading {
  add: PyramidAdd | null;
  /** Why no add is due, in plain words. Null when one is. */
  reason: string | null;
  /** The first lot closed against the trade on its first day (A-TIME-12): a warning that the trade may be wrong. */
  holdWarning?: string | null;
}

export function readPyramidAdd(input: PyramidInput): PyramidReading {
  const { side, lots, daily, price } = input;
  const long = side === "long";
  if (lots.length === 0) return { add: null, reason: "No position." };

  const first = lots[0];
  const last = lots[lots.length - 1];
  const risk = Math.abs(first.price - input.initialStop);
  if (!(risk > 0)) return { add: null, reason: "No risk unit to measure profit against." };

  // Time to hold (A-TIME-12): with the trend only once the first lot showed a
  // profit at its first close and still after three days.
  const hold = readHoldTime(side, first.price, first.date, daily);
  const holdWarning = hold?.firstCloseAgainst
    ? "The first day closed against the trade, a sign it may be wrong."
    : null;
  if (hold?.withTrendAfter3 !== true) {
    return {
      add: null,
      reason:
        hold?.withTrendAfter3 === false
          ? "The trade did not show a profit at its first close and three days on, so it hasn't shown it is with the trend."
          : "Three days haven't closed since the first lot, so the trade hasn't shown it is with the trend yet.",
      holdWarning,
    };
  }

  // Only add to a winner: the last lot must show a full risk unit of profit.
  const lastProfit = long ? price - last.price : last.price - price;
  if (lastProfit < risk) return { add: null, reason: "The last lot hasn't yet gained as much as the trade risked." };

  // Where the trend proves itself: an old top (bottom) made since the last lot.
  const swings = walkSwingChart(daily, THREE_DAY_CHART);
  const lastIdx = daily.findIndex((b) => b.t.slice(0, 10) >= last.date);
  const pivot = [...swings.pivots]
    .reverse()
    .find((p) => p.kind === (long ? "top" : "bottom") && lastIdx !== -1 && p.index >= lastIdx);
  if (!pivot) return { add: null, reason: "No swing top has formed since the last lot to cross." };
  const trigger = beyondByThreePoints(pivot.price, long ? 1 : -1);

  const qty = Math.floor(last.qty / 2);
  if (qty < 1) return { add: null, reason: "The next lot would be less than one share." };

  // The whole position's stop: never where the combined position could lose.
  const totalQty = lots.reduce((n, l) => n + l.qty, 0) + qty;
  const avg = (lots.reduce((n, l) => n + l.qty * l.price, 0) + qty * trigger) / totalQty;
  const newStop = long ? Math.max(input.stop, avg) : Math.min(input.stop, avg);
  // A stop that would already be through the market can't be placed.
  if (long ? newStop >= price : newStop <= price) {
    return { add: null, reason: "Price is too close to break-even for the combined position to be protected." };
  }

  return {
    add: {
      qty,
      trigger,
      newStop,
      note: `Add ${qty} share${qty === 1 ? "" : "s"} if price ${long ? "crosses above" : "breaks below"} ${trigger.toFixed(2)} (the last swing ${long ? "top" : "bottom"}), then move the stop on the whole position to ${newStop.toFixed(2)} so it can't turn into a loss.`,
    },
    reason: null,
  };
}

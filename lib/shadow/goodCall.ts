/**
 * Good and bad calls: how a setup card is scored once its entry fills.
 *
 * Owner's definition (2026-11-10, verbatim): "if prices is at 90, you tell the
 * user to get in at 92, price jumps to the first tp at 95 before dropping to
 * 89, that is on the user if they do not take profit and lose. however, if
 * Price is at 90, you tell the user to get in at 92, and price falls to 89
 * after hitting the entry price, well then that would be a 'bad call' by you."
 *
 * So, from the fill on: the first target (TP1) reached before the stop is a
 * good call; the stop reached before TP1 is a bad call. A bar that touches
 * both is a bad call, because a bar alone cannot say which came first (the
 * replay's bracket and the research harness read it the same way). A card
 * that never fills is neither, and is counted on its own. What happens after
 * TP1 is the member's to manage, so it is not read here.
 *
 * A card type is worth showing when its good-call rate beats its break-even
 * rate, stop distance / (stop distance + TP1 distance): below that, being
 * right more often than wrong still loses money (`breakEvenRate`).
 *
 * Three-question basis:
 * 1. Gann: "when in doubt, keep out" (How to Make Profits in Commodities,
 *    p. 255): a card is a call to act, so it is judged on whether acting on
 *    it paid. No rule of his is computed here.
 * 2. Cycles: no periodicity claim. Dewey's out-of-sample rule (criterion 7)
 *    is why this is scored forward, on calls made before their bars existed.
 * 3. Hermetic: Cause and Effect: the call is the cause and the first target
 *    or the stop the effect it is held to. Law of Creation: a mixture; this
 *    is a measurement, it creates nothing.
 */

import type { Bar } from "@/lib/types";

export type CallOutcome = "good" | "bad" | "open";

/**
 * Sessions after the fill's session a call may take to reach TP1 or its
 * stop. Past this with neither touched it is settled `unresolved`, counted
 * apart and never read again. An engineering choice: about a trading year,
 * so nearly every call resolves (the held-out read walked to the end of its
 * half and left 0.6% of RSI reversal fills unresolved).
 */
export const GOOD_CALL_MAX_SESSIONS = 250;

export interface GoodCallInput {
  long: boolean;
  fill: number;
  stop: number;
  tp1: number;
  /** Bars from the fill bar on, oldest first (the fill bar is `bars[0]`). */
  bars: readonly Bar[];
}

/**
 * Pure. Walks the bars from the fill: the stop first, then TP1, bar by bar,
 * the fill bar included; a bar that touches both is `bad`. `open` while
 * neither has been touched. A TP1 not beyond the fill, or a stop not on the
 * losing side of it, is a malformed card and reads `bad` at once, since a
 * member following it could not have taken a profit before the risk.
 */
export function walkGoodCall(input: GoodCallInput): CallOutcome {
  const { long, fill, stop, tp1, bars } = input;
  if (![fill, stop, tp1].every(Number.isFinite)) return "bad";
  if (long ? !(tp1 > fill && stop < fill) : !(tp1 < fill && stop > fill)) return "bad";
  for (const b of bars) {
    const stopped = long ? b.l <= stop : b.h >= stop;
    if (stopped) return "bad";
    const reached = long ? b.h >= tp1 : b.l <= tp1;
    if (reached) return "good";
  }
  return "open";
}

/**
 * The share of decided calls a card needs to be good to break even:
 * risk / (risk + reward), from the plan's own distances at the fill.
 * `null` when the plan has no reward or no risk.
 */
export function breakEvenRate(fill: number, stop: number, tp1: number): number | null {
  const risk = Math.abs(fill - stop);
  const reward = Math.abs(tp1 - fill);
  if (!(risk > 0) || !(reward > 0)) return null;
  return risk / (risk + reward);
}

export interface GoodCallTally {
  /** Cards issued. */
  calls: number;
  /** Never filled. */
  noFill: number;
  good: number;
  bad: number;
  /** Filled and still neither. */
  open: number;
  /** Filled, and neither level reached within `GOOD_CALL_MAX_SESSIONS`. */
  unresolved: number;
  /** Good over good plus bad, `null` before any is decided. */
  goodRate: number | null;
  /** Mean break-even rate over the filled calls (as the held-out read averages it), `null` with none. */
  breakEven: number | null;
  /** Mean result per decided call in R: TP1 / risk for a good call, -1 for a bad one. */
  expectancyR: number | null;
}

export interface ScoredCall {
  call: CallOutcome | "no_fill" | "unresolved";
  fill: number | null;
  stop: number;
  tp1: number | null;
}

/** Pure. Totals a list of scored calls. */
export function tallyGoodCalls(calls: readonly ScoredCall[]): GoodCallTally {
  let noFill = 0;
  let good = 0;
  let bad = 0;
  let open = 0;
  let unresolved = 0;
  let beSum = 0;
  let beN = 0;
  let rSum = 0;
  let rN = 0;
  for (const c of calls) {
    if (c.call === "no_fill") {
      noFill++;
      continue;
    }
    const be = c.fill != null && c.tp1 != null ? breakEvenRate(c.fill, c.stop, c.tp1) : null;
    if (be != null) {
      beSum += be;
      beN++;
    }
    if (c.call === "open") open++;
    else if (c.call === "unresolved") unresolved++;
    else {
      if (c.call === "good") good++;
      else bad++;
      // A good call earns reward / risk = (1 - be) / be; a bad one loses 1R.
      // A good call with no measurable distances (never true of a well-formed
      // card, `walkGoodCall`) adds no R.
      if (c.call === "bad") {
        rSum += -1;
        rN++;
      } else if (be != null) {
        rSum += (1 - be) / be;
        rN++;
      }
    }
  }
  const decided = good + bad;
  return {
    calls: calls.length,
    noFill,
    good,
    bad,
    open,
    unresolved,
    goodRate: decided > 0 ? good / decided : null,
    breakEven: beN > 0 ? beSum / beN : null,
    expectancyR: rN > 0 ? rSum / rN : null,
  };
}

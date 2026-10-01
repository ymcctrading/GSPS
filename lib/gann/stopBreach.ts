/**
 * A breached stop retires the plan (owner decision, 2026-09-30), and comes back
 * only the way Gann says it does.
 *
 * The owner's rule: "A breach retires the plan, until an updated scan is run and
 * a plan is either confirmed or an updated plan replaces the original." Follow-up
 * the same day: "if Gann has his own version of confirmed or replaced, implement
 * his rule, methodology instead ... the sentiment/premise needs to align."
 *
 * Before this, three surfaces called a plan dead from a quote (the lists, the
 * order ticket, the twice-hourly monitor sweep) while the scan behind the
 * symbol page read only completed daily structure, returned the same plan, and
 * re-armed the monitor the sweep had just invalidated (AGENTS.md finding F3.7).
 * Now the scan holds a plan whose stop price is through: Reject, the monitor
 * goes INVALIDATED and stays there.
 *
 * **Gann's own "confirmed": a failed break.** A broken level changes sides: the
 * old bottom becomes a top (*New Stock Trend Detector* p. 13), so a rally back to
 * it is a test of resistance, not a second chance at the buy. Only a rally that
 * goes on through it by his 3-point allowance shows the break was false: after
 * breaking an old bottom by 3 points a stock "should not rally 3 points back
 * above it" (NSTD p. 20), rallies to old bottoms stop within 1-2 points (average
 * 3) above, and more than 5 above means it is going higher (*Master Stock Market
 * Course*, the range rules, pp. 246-248). And he wants the close to decide: "still
 * safer to wait for a close beyond it ... intraday pokes often reverse by the
 * close" (Master Course, rules 4 and 5, p. 7). So a broken plan stands again
 * only when a closed bar has closed back through the broken level by the
 * allowance (`reclaimLevel`, price-scaled by `lib/gann/pointScale.ts`, the same
 * "3 points" the exit rules use). Price merely returning between the stop and
 * that line does not reinstate it, and neither does returning to the old entry
 * on the tick.
 *
 * **Gann's own "replaced": a new trade with a new stop.** He never resumes a
 * stopped trade at its old levels. The stop caught means the chart has reversed
 * (Master Course, Overnight Chart rule 4; NSTD Rule 6: "if stopped, cover and
 * go long again", as a new trade); in *Tunnel Thru the Air* he is stopped out at
 * 225 and re-buys at 218, stop 212, for a stated reason. A new long needs a new
 * bottom that holds (2-3 days in an active market, NSTD p. 20) and a cross of an
 * old top with a new stop 3 points under it; a short after a broken bottom is
 * sold on a small rally with the stop 3 points above the old bottom. All of that
 * is what `computeGannEntryTrigger` reads from the swing chart on completed
 * daily bars, and the swing chart turns the moment the last swing bottom is
 * broken, so once the break has made a daily bar the scan prices a different
 * plan (or none). Nothing here resurrects the old one; "replaced" needs no code
 * beyond not reinstating it.
 *
 * Three-question basis (AGENTS.md):
 * 1. Gann, as cited above (Tier A, `docs/GANN_HISTORICAL_SOURCES.md`). The stop
 *    already sits beyond the swing extreme by his lost-motion allowance (*How to
 *    Make Profits in Commodities* p. 38), so touching it has cleared an ordinary
 *    poke. His rule 5 (a close decides) argues for holding the plan until the
 *    close, not retiring it on a touch. The owner chose the stricter reading;
 *    the close is where Gann's rule bites here, on the way back in. Options are
 *    written up in docs/GANN_SETUP_LIFECYCLE_INTRADAY_TIMELINE.md, Part 1.4.
 * 2. Cycles. No periodicity claim, so Dewey's checklist does not apply. The one
 *    thing borrowed from that literature is the engineering property of
 *    phase-resumption after distortion: the scan carries no stored "retired"
 *    flag. It reads the session's closed bars against the stop every time it
 *    runs, so a missed or late scan resumes correctly on the next one, and the
 *    monitor's INVALIDATED state is the only memory (already stale-evaluation
 *    safe).
 * 3. Hermetic. Polarity: the broken level changes sides, support becomes
 *    resistance, and is won back only by going through it. Cause and Effect: a
 *    caught stop is an effect whose cause, the broken structure, has to be read
 *    again before another entry. Rhythm: the scan returns on its own schedule; a
 *    retired plan waits for the next turn of it rather than being switched off
 *    for good.
 *
 * Applied on the live scan (`lib/scanTicker.ts`) and, as a path-dependent
 * version of the same test, on the replay (`lib/backtest/replay.ts`), so the two
 * cannot drift (the `harmonicProximity` failure shape).
 */

import type { Bar } from "@/lib/types";
import { isInvalidatedByStop } from "@/lib/trade/invalidate-pending";
import { gannThreePoints } from "@/lib/gann/pointScale";

export type PlanDirection = "bullish" | "bearish";

export interface StopBreachReading {
  breached: boolean;
  /** The plan's stop and the price found through it; null when there was no plan to read. */
  stop: number | null;
  price: number | null;
  /**
   * The line a closed bar has to close back through for the break to count as
   * failed and the plan to stand again: the broken level plus (long) or minus
   * (short) Gann's 3-point allowance. Null when there was no plan to read.
   */
  reclaimAt: number | null;
}

/** True when `price` has reached the plan's stop: at or below it for a long, at or above it for a short. */
export function isStopBreached(direction: PlanDirection, stop: number | null, price: number): boolean {
  return isInvalidatedByStop({ side: direction === "bearish" ? "sell" : "buy", stop_price: stop }, price);
}

/**
 * How many of Gann's points a close has to clear the broken level by. Three is
 * the figure his false-break rule names (NSTD p. 20: a stock "should not rally 3
 * points back above" a broken bottom), and it is what the live scan uses. He
 * also says a rally of more than five above an old bottom means it is going
 * higher (*Master Stock Market Course*, pp. 246-248), so five is the stricter
 * reading. Only the replay may vary it (`ReplayOptions.reclaimPoints`), to
 * measure the two against each other before the live number moves; nothing in
 * the live scan passes anything but this default.
 */
export const RECLAIM_POINTS = 3;
/** The stricter reading, for the replay's side-by-side. */
export const RECLAIM_POINTS_STRICT = 5;

/**
 * The line a rally back through the broken stop has to clear for the break to
 * count as false: the stop plus Gann's allowance for a long, minus it for a
 * short. The allowance is his 3 points, price-scaled (`lib/gann/pointScale.ts`)
 * and read at the broken level's own price, times `points / 3` when the replay
 * asks for a different count.
 */
export function reclaimLevel(
  direction: PlanDirection,
  stop: number,
  points: number = RECLAIM_POINTS,
  /** Multiplies the allowance, for a chart finer than the daily one (the replay's intraday profile). 1 on every live path. */
  scale: number = 1,
): number {
  const allowance = (gannThreePoints(stop) * scale * points) / 3;
  return direction === "bearish" ? stop - allowance : stop + allowance;
}

/** True when a bar's close has gone back through the broken level by the allowance. */
export function isReclaimedByClose(
  direction: PlanDirection,
  stop: number,
  bar: Pick<Bar, "c">,
  points: number = RECLAIM_POINTS,
  scale: number = 1,
): boolean {
  const line = reclaimLevel(direction, stop, points, scale);
  return direction === "bearish" ? bar.c <= line : bar.c >= line;
}

/**
 * The replay's path-dependent read of a break. A candle trades through a long's
 * stop when its low reaches it, through a short's when its high does.
 */
export function isStopBreachedByBar(direction: PlanDirection, stop: number | null, bar: Pick<Bar, "h" | "l">): boolean {
  return isStopBreached(direction, stop, direction === "bearish" ? bar.h : bar.l);
}

/**
 * The scan's read: is the plan it just priced broken, and has the break failed?
 *
 * `sessionBars` are the closed execution bars of the current session, oldest
 * first. The plan is broken when the price the scan ran at is through the stop,
 * or when a bar of the session traded through it and no bar since (the breaking
 * bar included) has closed back through `reclaimLevel`. A bar that wicked
 * through the stop and closed back past the line is a poke that reversed by the
 * close, which Gann does not count. No plan, no stop or no price reads as not
 * broken, because there is nothing to retire. The session is all this can see:
 * a break that already made a completed daily bar has turned the swing chart,
 * and the scan prices a different plan from it.
 */
export function readStopBreach(input: {
  direction: PlanDirection | "none";
  stopLoss: number | null | undefined;
  price: number | null | undefined;
  sessionBars?: Pick<Bar, "h" | "l" | "c">[];
}): StopBreachReading {
  const { direction, stopLoss, price, sessionBars = [] } = input;
  if (direction === "none" || stopLoss == null || !(stopLoss > 0) || price == null || !(price > 0)) {
    return { breached: false, stop: stopLoss ?? null, price: price ?? null, reclaimAt: null };
  }
  const reclaimAt = reclaimLevel(direction, stopLoss);
  const through = isStopBreached(direction, stopLoss, price);

  let lastBreak = -1;
  sessionBars.forEach((bar, i) => {
    if (isStopBreachedByBar(direction, stopLoss, bar)) lastBreak = i;
  });
  const reclaimed =
    lastBreak >= 0 && sessionBars.slice(lastBreak).some((bar) => isReclaimedByClose(direction, stopLoss, bar));

  return {
    breached: through || (lastBreak >= 0 && !reclaimed),
    stop: stopLoss,
    price,
    reclaimAt,
  };
}

/**
 * A breached stop retires the plan (owner decision, 2026-09-30).
 *
 * The owner's rule: "A breach retires the plan, until an updated scan is run and
 * a plan is either confirmed or an updated plan replaces the original."
 *
 * Before this, three surfaces called a plan dead from a quote (the lists, the
 * order ticket, the twice-hourly monitor sweep) while the scan behind the
 * symbol page read only completed daily structure, returned the same plan, and
 * re-armed the monitor the sweep had just invalidated (AGENTS.md finding F3.7).
 * The plan drawn on the chart and the plan called dead on the dashboard were
 * the same plan. Now the scan itself holds a plan whose stop price is through:
 * it is Reject, the monitor goes INVALIDATED and stays there, and only a scan
 * run afterwards, with price back inside the stop, can confirm it (the same
 * levels) or replace it (new levels from the structure as it now stands).
 * Price returning to the old entry does not bring the plan back by itself.
 *
 * Three-question basis (AGENTS.md):
 * 1. Gann. Master Stock Market Course Ch. 3 Rule 4: when the stop is caught the
 *    chart has reversed, and he does not wait for price to return to where the
 *    first trade was entered. New Stock Trend Detector p. 13: old bottoms become
 *    tops, so the broken support is now resistance and a return to the old entry
 *    is a test of it, not a second chance at the buy. Tunnel Thru the Air:
 *    stopped out at 225, he re-buys at 218 with a stop at 212, a new trade with
 *    a new stop and a stated reason. The stop already sits beyond the swing
 *    extreme by his lost-motion allowance (How to Make Profits in Commodities
 *    p. 38), so a touch of it has cleared his allowance for an ordinary poke.
 *    Note his rule 5 (intraday pokes often reverse by the close) argues for
 *    holding the plan for a close instead. The owner chose the stricter reading
 *    (a touch retires it) and left the confirming to the next scan, which is how
 *    a poke that closed back inside gets its plan back. Options are written up
 *    in docs/GANN_SETUP_LIFECYCLE_INTRADAY_TIMELINE.md, Part 1.4.
 *    `docs/GANN_HISTORICAL_SOURCES.md` has the tiers (Tier A throughout).
 * 2. Cycles. No periodicity claim, so Dewey's checklist does not apply. The one
 *    thing borrowed from that literature is the engineering property of
 *    phase-resumption after distortion: the scan carries no stored "retired"
 *    flag. It reads price against the stop every time it runs, so a missed or
 *    late scan resumes correctly on the next one, and the monitor's INVALIDATED
 *    state is the only memory (it is already stale-evaluation safe).
 * 3. Hermetic. Polarity: the broken level changes sides, support becomes
 *    resistance. Cause and Effect: a caught stop is an effect whose cause, the
 *    broken structure, has to be read again before another entry. Rhythm: the
 *    scan returns on its own schedule; a retired plan waits for the next turn
 *    of it rather than being switched off for good.
 *
 * Applied on the live scan (`lib/scanTicker.ts`) and, as a path-dependent
 * version of the same test, on the replay (`lib/backtest/replay.ts`), so the two
 * cannot drift (the `harmonicProximity` failure shape).
 */

import type { Bar } from "@/lib/types";
import { isInvalidatedByStop } from "@/lib/trade/invalidate-pending";

export type PlanDirection = "bullish" | "bearish";

export interface StopBreachReading {
  breached: boolean;
  /** The plan's stop and the price found through it; null when there was no plan to read. */
  stop: number | null;
  price: number | null;
}

/** True when `price` has reached the plan's stop: at or below it for a long, at or above it for a short. */
export function isStopBreached(direction: PlanDirection, stop: number | null, price: number): boolean {
  return isInvalidatedByStop({ side: direction === "bearish" ? "sell" : "buy", stop_price: stop }, price);
}

/**
 * The scan's point-in-time read: is the price the scan was run at through the
 * stop of the plan it just priced? No plan, no stop or no price reads as not
 * breached, because there is nothing to retire.
 */
export function readStopBreach(input: {
  direction: PlanDirection | "none";
  stopLoss: number | null | undefined;
  price: number | null | undefined;
}): StopBreachReading {
  const { direction, stopLoss, price } = input;
  if (direction === "none" || stopLoss == null || price == null || !(price > 0)) {
    return { breached: false, stop: stopLoss ?? null, price: price ?? null };
  }
  return { breached: isStopBreached(direction, stopLoss, price), stop: stopLoss, price };
}

/**
 * The replay's path-dependent read of the same rule. A candle trades through a
 * long's stop when its low reaches it, through a short's when its high does.
 * Any candle of the session before the one the entry fires on retires the plan
 * for the rest of that session; the next session's scan is the updated scan.
 */
export function isStopBreachedByBar(direction: PlanDirection, stop: number | null, bar: Pick<Bar, "h" | "l">): boolean {
  return isStopBreached(direction, stop, direction === "bearish" ? bar.h : bar.l);
}

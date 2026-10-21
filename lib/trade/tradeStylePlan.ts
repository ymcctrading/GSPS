/**
 * The pricing half of the trade styles (`tradeStyle.ts`): the stop each style
 * uses and the fast-market plan priced from a swing plan. Server and replay
 * only. Sources and design basis: `tradeStyle.ts`.
 */

import { gannDayStop } from "@/lib/gann/dayStop";
import type { TradeStyle } from "@/lib/trade/tradeStyle";

/**
 * The stop a plan uses in this style. Swing keeps the plan's own Gann stop.
 * Fast puts it 3 points beyond the last completed day's low (high, short),
 * never looser than the plan's stop, and never on or past the entry (a day
 * stop that is no stop is no Fast trade: the swing stop stands).
 */
export function styleStop(params: {
  style: TradeStyle;
  direction: "bullish" | "bearish";
  entry: number;
  planStop: number;
  /** The last completed daily bar. */
  lastDay: { h: number; l: number } | null;
}): number {
  const { style, direction, entry, planStop, lastDay } = params;
  if (style !== "fast" || !lastDay) return planStop;
  const side = direction === "bullish" ? "long" : "short";
  const stop = gannDayStop({ extreme: side === "long" ? lastDay.l : lastDay.h, side, planStop });
  if (stop == null) return planStop;
  const onRightSide = side === "long" ? stop < entry : stop > entry;
  return onRightSide ? stop : planStop;
}

/**
 * The fast-market plan from a priced swing plan: the same entry with the stop
 * moved to Gann's day stop, re-priced by the caller's own pricing function so
 * the targets read the new risk ("profits must exceed losses"). Null when the
 * day stop is no tighter than the swing stop, or the re-pricing fails. Shared
 * by the live scan and the replay, so both read one fast plan.
 */
export function priceFastLevels<S extends { direction: "bullish" | "bearish"; triggerPrice: number; stopPrice: number }, L extends { stopLoss: number }>(
  swing: L,
  source: S,
  lastDay: { h: number; l: number } | null,
  price: (source: S) => L,
): L | null {
  const stop = styleStop({ style: "fast", direction: source.direction, entry: source.triggerPrice, planStop: swing.stopLoss, lastDay });
  if (stop === swing.stopLoss) return null;
  try {
    return price({ ...source, stopPrice: stop });
  } catch {
    return null;
  }
}

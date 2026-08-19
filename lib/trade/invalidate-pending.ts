/**
 * Pending-entry invalidation.
 * -----------------------------------------------------------------------------
 * A resting entry order (`orders.status = 'new'`) carries both the planned
 * entry (`limit_price`) and the protective stop the trade would open with
 * (`stop_price`). Those two levels are the trade's structure: if price breaks
 * the stop before ever reaching the entry, the setup that justified the trade
 * is already gone — filling it now, or leaving it resting hoping the entry
 * still comes, is not the trade that was planned.
 *
 * Without this check, such an order just sits in Pending indefinitely: it's
 * never marketable (price never reached the entry), so `evaluateRestingOrders`
 * has nothing to fill, and nothing else ever revisits it. This is what turns
 * into a stale "pending for days" order a user has to notice and cancel by
 * hand.
 */

export interface InvalidatableOrder {
  side: "buy" | "sell";
  limit_price: number | null;
  stop_price: number | null;
}

/**
 * True when the market has reached the planned stop while the order is still
 * unfilled. A `buy` entry's stop sits below the entry, so a long setup is
 * invalidated by price falling to or through it; a `sell` (short) entry's
 * stop sits above the entry, invalidated by price rising to or through it.
 */
export function isInvalidatedByStop(order: InvalidatableOrder, market: number): boolean {
  const stop = order.stop_price;
  if (stop == null || !Number.isFinite(stop) || !Number.isFinite(market)) return false;
  return order.side === "buy" ? market <= stop : market >= stop;
}

/** One sentence, shown verbatim in the Rejected Orders card (see `reject_reason`). */
export function invalidationReason(order: InvalidatableOrder, market: number): string {
  const direction = order.side === "buy" ? "fell to" : "rose to";
  const entry = order.limit_price != null ? ` before ever reaching the ${formatUsd(order.limit_price)} entry` : "";
  return (
    `Invalidated: price ${direction} ${formatUsd(market)}, through the ${formatUsd(order.stop_price)} ` +
    `stop-loss${entry}. The setup this order was placed for no longer holds, so it was canceled ` +
    `rather than left resting on a broken structure.`
  );
}

function formatUsd(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${n.toFixed(2)}`;
}

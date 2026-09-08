/**
 * Stop-based invalidation.
 * -----------------------------------------------------------------------------
 * A directional bet — a resting entry order, an order-ticket draft, a scanned
 * setup not yet acted on — is staked on a stop: if price breaks it before the
 * bet is ever filled, the setup that justified the trade is already gone.
 * Filling it now, or (for an order) leaving it resting hoping the entry still
 * comes, is not the trade that was planned.
 *
 * Originally written for one consumer only: a resting entry order
 * (`orders.status = 'new'`), which carries both the planned entry
 * (`limit_price`) and the protective stop (`stop_price`) — without this
 * check such an order just sits in Pending indefinitely, since it's never
 * marketable (price never reached the entry), so `evaluateRestingOrders` has
 * nothing to fill and nothing else ever revisits it. That's still
 * `invalidationReason`'s job below, hence `InvalidatableOrder` keeping
 * `limit_price` for its message. `isInvalidatedByStop` itself needs none of
 * that — see `StopCheck`.
 */

/**
 * The minimal shape `isInvalidatedByStop` actually needs: a direction and the
 * stop it's staked on. Deliberately smaller than `InvalidatableOrder` below —
 * a scan setup or an order-ticket draft has a side and a stop before it ever
 * has a resting order to attach `limit_price` to, and forcing callers to pass
 * `limit_price: null` to satisfy an order-shaped type they don't have an
 * order for is exactly the kind of mismatch that makes a shared check look
 * like it doesn't apply outside the order lifecycle it was named for.
 */
export interface StopCheck {
  side: "buy" | "sell";
  stop_price: number | null;
}

/** A resting entry order — `StopCheck` plus the planned entry, for the
 * cancellation-message wording in `invalidationReason` below. */
export interface InvalidatableOrder extends StopCheck {
  limit_price: number | null;
}

/**
 * True when the market has reached the planned stop. A `buy` entry's stop
 * sits below the entry, so a long setup is invalidated by price falling to
 * or through it; a `sell` (short) entry's stop sits above the entry,
 * invalidated by price rising to or through it.
 *
 * Applies equally to a resting order (the original use — see module header),
 * an order-ticket draft checked before submission, or a scanned setup
 * checked before it's ever acted on: all three ask the same question — has
 * price crossed the level this directional bet is staked on.
 */
export function isInvalidatedByStop(check: StopCheck, market: number): boolean {
  const stop = check.stop_price;
  if (stop == null || !Number.isFinite(stop) || !Number.isFinite(market)) return false;
  return check.side === "buy" ? market <= stop : market >= stop;
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

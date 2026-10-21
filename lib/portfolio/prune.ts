/**
 * Which ended orders the Orders tab stops showing: nothing on the website
 * shows a position or order more than 3 hours past the market close that
 * followed its ending.
 *
 * Until 2026-10-21 the rows were deleted, from the Orders and Portfolio GET
 * handlers. `trade_logs.order_id` and `.position_id` are `on delete set null`
 * (migration 0002), so every deletion cut the trade's record loose from the
 * order and position behind it: in production all 14 trade logs had lost
 * both (review finding S-07). Gann kept a record of every trade, and the
 * method's own rules read it back (the series of losses, the profit peak, the
 * winning run). The rows are kept now and only hidden from the tab; a GET no
 * longer deletes anything. Retention policy (owner, 2026-10-21): kept
 * indefinitely, leaving only when the member's account is deleted (their
 * foreign keys cascade from `auth.users`). Nothing prunes them on a timer.
 *
 * The retention window is anchored to the market close rather than a flat
 * duration: a position that closes at 15:55 and one that closes at 09:35 both
 * belong on the Portfolio tab for the rest of that trading day, not for a
 * fixed number of hours that has nothing to do with when the next session
 * starts. See `lib/market/session.ts` (`mostRecentClose`) for the close-time
 * calculation.
 */

import { mostRecentClose } from "@/lib/market/session";

export const RETENTION_GRACE_MS = 3 * 3600 * 1000;

/**
 * A row with an ending timestamp `<= cutoff` has aged off the tab. The
 * cutoff is the most recent market close that is itself already at least
 * `RETENTION_GRACE_MS` in the past — equivalently, the most recent close at
 * or before `now - grace`.
 */
export function retentionCutoff(now: Date): string {
  return mostRecentClose(new Date(now.getTime() - RETENTION_GRACE_MS)).toISOString();
}

/** Order statuses that ended without a position, hidden once stale. */
const HIDDEN_TERMINAL_STATUSES = new Set([
  "rejected",
  "canceled",
  "cancelled", // Alpaca spells it with one L; accept both
  "expired",
  "replaced",
  "done_for_day",
]);

/**
 * The ids of orders that have reached a terminal state — filled and no
 * longer held (a closed position), or ended without ever filling — and are
 * past the retention cutoff. `updated_at` is the closest thing an order has
 * to an "ended at" timestamp. A filled order in a symbol still held is never
 * hidden, whatever its age.
 */
export function agedOffOrderIds(
  orders: readonly { id: unknown; symbol: unknown; status: unknown; updated_at: unknown }[],
  heldSymbols: ReadonlySet<string>,
  now: Date = new Date(),
): Set<string> {
  const cutoff = Date.parse(retentionCutoff(now));
  const ids = new Set<string>();
  for (const o of orders) {
    const ended = Date.parse(String(o.updated_at));
    if (!(ended < cutoff)) continue;
    const status = String(o.status);
    const filledAndGone = status === "filled" && !heldSymbols.has(String(o.symbol).toUpperCase());
    if (filledAndGone || HIDDEN_TERMINAL_STATUSES.has(status)) ids.add(String(o.id));
  }
  return ids;
}

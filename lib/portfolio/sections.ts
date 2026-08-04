/**
 * Portfolio sectioning — splits the order ledger into the three buckets the
 * Portfolio tab renders: Open, Pending, and Closed.
 *
 * There is no single `status` column that answers "is this position open?".
 * The `orders` table carries the broker's order status (Alpaca's vocabulary,
 * mirrored verbatim on insert and update), which settles Pending vs. terminal,
 * but a `filled` order says nothing about whether the position it opened is
 * still held — a filled entry and a filled exit look identical in that column.
 * So the classification is a derived condition: order status first, and for
 * `filled` orders, whether the symbol still appears in the broker's live
 * positions.
 *
 *   Open    — filled, and the symbol is still held at the broker.
 *   Pending — submitted/queued, not yet fully filled or confirmed.
 *   Closed  — filled and no longer held (exited/settled), plus orders that
 *             ended without ever becoming a position (canceled, expired,
 *             rejected, replaced).
 */

import type { BlendedPosition } from "./blend";

export type PositionSection = "open" | "pending" | "closed";

/** The order fields sectioning needs — anything wider passes through intact. */
export interface SectionableOrder {
  symbol: string;
  status: string;
  created_at: string;
}

export interface SectionedOrders<T> {
  open: T[];
  pending: T[];
  closed: T[];
}

/**
 * Working states: the order is live at the broker and has not finished.
 * `partially_filled` counts as pending because the order itself is still
 * working — the shares that did fill already show up under Open through the
 * broker's live position for that symbol.
 */
const PENDING_STATUSES = new Set([
  "new",
  "accepted",
  "accepted_for_bidding",
  "calculated",
  "held",
  "partially_filled",
  "pending_cancel",
  "pending_new",
  "pending_replace",
  "pending_review",
  "suspended",
]);

/** Terminal states that never left a position behind. */
const CLOSED_STATUSES = new Set([
  "canceled",
  "cancelled",
  "done_for_day",
  "expired",
  "rejected",
  "replaced",
  "stopped",
]);

/** Symbols the broker currently reports a live position in, upper-cased. */
export function heldSymbols(blendedPositions: BlendedPosition[]): Set<string> {
  const held = new Set<string>();
  for (const group of blendedPositions) {
    if (group.equity) held.add(group.equity.symbol.toUpperCase());
    for (const leg of group.options) held.add(leg.symbol.toUpperCase());
  }
  return held;
}

/** Live legs across every blended group — what "Open Positions (N)" counts. */
export function countOpenLegs(blendedPositions: BlendedPosition[]): number {
  return blendedPositions.reduce((n, g) => n + (g.equity ? 1 : 0) + g.options.length, 0);
}

/**
 * Which section an order belongs to. An unrecognized status is treated as
 * pending rather than closed: a status we don't know is most likely a live
 * broker state, and Pending renders expanded, so the row stays visible instead
 * of being buried in the collapsed Closed section.
 */
export function classifyOrder(order: SectionableOrder, held: ReadonlySet<string>): PositionSection {
  const status = order.status?.toLowerCase().trim() ?? "";
  if (CLOSED_STATUSES.has(status)) return "closed";
  if (PENDING_STATUSES.has(status)) return "pending";
  if (status === "filled") {
    return held.has(order.symbol?.toUpperCase() ?? "") ? "open" : "closed";
  }
  return "pending";
}

/** Newest first, by placement time. Rows with an unparseable date sort last. */
function byNewestFirst(a: SectionableOrder, b: SectionableOrder): number {
  const ta = Date.parse(a.created_at);
  const tb = Date.parse(b.created_at);
  if (Number.isNaN(ta) && Number.isNaN(tb)) return 0;
  if (Number.isNaN(ta)) return 1;
  if (Number.isNaN(tb)) return -1;
  return tb - ta;
}

/**
 * Split orders into the three sections, each sorted newest first. The API
 * already returns `created_at desc`, but sorting here keeps each section
 * ordered no matter what order the caller hands them over in.
 */
export function sectionOrders<T extends SectionableOrder>(
  orders: T[],
  blendedPositions: BlendedPosition[],
): SectionedOrders<T> {
  const held = heldSymbols(blendedPositions);
  const sections: SectionedOrders<T> = { open: [], pending: [], closed: [] };
  for (const order of orders) {
    sections[classifyOrder(order, held)].push(order);
  }
  sections.open.sort(byNewestFirst);
  sections.pending.sort(byNewestFirst);
  sections.closed.sort(byNewestFirst);
  return sections;
}

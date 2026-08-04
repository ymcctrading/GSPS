/**
 * Portfolio sectioning — splits the order ledger into the four buckets the
 * Portfolio tab renders: Open, Pending, Closed, and Canceled & Rejected.
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
 *   Open     — filled, and the symbol is still held at the broker.
 *   Pending  — submitted/queued, not yet fully filled or confirmed.
 *   Closed   — filled and no longer held: a position that was exited/settled.
 *   Unfilled — ended without ever becoming a position. Canceled and rejected
 *              are different events (one is a withdrawal, the other a refusal)
 *              and stay distinguishable inside the section by disposition.
 */

import type { BlendedPosition } from "./blend";

export type PositionSection = "open" | "pending" | "closed" | "unfilled";

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
  unfilled: T[];
}

/**
 * Working states: the order is live at the broker and has not finished.
 *
 * `partially_filled` counts as pending because the order itself is still
 * working — the shares that did fill already show up under Open through the
 * broker's live position for that symbol. `stopped` is pending for the same
 * reason: the broker has guaranteed a trade at a stated price, but it hasn't
 * happened yet.
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
  "stopped",
  "suspended",
]);

/**
 * How an unfilled order ended. These are distinct events, not synonyms — a
 * rejection is the broker refusing the order outright, a cancellation is it
 * being pulled after the broker accepted it — so the section keeps them apart
 * rather than flattening them into one "didn't fill" pile.
 */
export type Disposition = "canceled" | "rejected" | "expired" | "replaced" | "done_for_day";

const DISPOSITION_BY_STATUS: Record<string, Disposition> = {
  canceled: "canceled",
  cancelled: "canceled", // Alpaca spells it with one L; guard the other spelling
  rejected: "rejected",
  expired: "expired",
  replaced: "replaced",
  done_for_day: "done_for_day",
};

export const DISPOSITION_LABELS: Record<Disposition, string> = {
  canceled: "Canceled",
  rejected: "Rejected",
  expired: "Expired",
  replaced: "Replaced",
  done_for_day: "Done for day",
};

/** One line each, so a row's group says why the order never became a position. */
export const DISPOSITION_DESCRIPTIONS: Record<Disposition, string> = {
  canceled: "Pulled before filling — by you, or by the broker's own cancel.",
  rejected: "The broker refused the order outright; it never reached the market.",
  expired: "Reached the end of its time in force without filling.",
  replaced: "Superseded by a corrected order that took its place.",
  done_for_day: "Stopped working for the session without filling.",
};

/** Fixed display order for the section's disposition sub-groups. */
export const DISPOSITION_ORDER: readonly Disposition[] = [
  "canceled",
  "rejected",
  "expired",
  "replaced",
  "done_for_day",
];

/** The disposition an order ended in, or null if it isn't an unfilled order. */
export function dispositionOf(status: string): Disposition | null {
  return DISPOSITION_BY_STATUS[normalize(status)] ?? null;
}

function normalize(status: string | null | undefined): string {
  return status?.toLowerCase().trim() ?? "";
}

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
 * pending rather than terminal: a status we don't know is most likely a live
 * broker state, and Pending renders expanded, so the row stays visible instead
 * of being buried in a collapsed section.
 */
export function classifyOrder(order: SectionableOrder, held: ReadonlySet<string>): PositionSection {
  const status = normalize(order.status);
  if (dispositionOf(status)) return "unfilled";
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
 * Split orders into the four sections, each sorted newest first. The API
 * already returns `created_at desc`, but sorting here keeps each section
 * ordered no matter what order the caller hands them over in.
 */
export function sectionOrders<T extends SectionableOrder>(
  orders: T[],
  blendedPositions: BlendedPosition[],
): SectionedOrders<T> {
  const held = heldSymbols(blendedPositions);
  const sections: SectionedOrders<T> = { open: [], pending: [], closed: [], unfilled: [] };
  for (const order of orders) {
    sections[classifyOrder(order, held)].push(order);
  }
  for (const bucket of Object.values(sections)) bucket.sort(byNewestFirst);
  return sections;
}

export interface DispositionGroup<T> {
  disposition: Disposition;
  /** "Canceled", "Rejected", … — the heading the sub-group renders under. */
  label: string;
  description: string;
  orders: T[];
}

/**
 * Break the unfilled section into its dispositions, in a fixed order, skipping
 * the ones with nothing in them. Row order inside each group is whatever the
 * caller passed in — `sectionOrders` has already sorted it newest first.
 */
export function groupByDisposition<T extends SectionableOrder>(orders: T[]): DispositionGroup<T>[] {
  const byDisposition = new Map<Disposition, T[]>();
  for (const order of orders) {
    const disposition = dispositionOf(order.status);
    if (!disposition) continue;
    const group = byDisposition.get(disposition);
    if (group) group.push(order);
    else byDisposition.set(disposition, [order]);
  }

  return DISPOSITION_ORDER.filter((d) => byDisposition.has(d)).map((disposition) => ({
    disposition,
    label: DISPOSITION_LABELS[disposition],
    description: DISPOSITION_DESCRIPTIONS[disposition],
    orders: byDisposition.get(disposition)!,
  }));
}

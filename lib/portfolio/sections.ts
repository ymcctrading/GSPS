/**
 * Portfolio sectioning — splits the order ledger into the five buckets the
 * Portfolio tab renders: Open, Pending, Rejected, Closed, and Canceled.
 *
 * There is no single `status` column that answers "is this position open?".
 * The `orders` table carries the broker's order status (Alpaca's vocabulary,
 * mirrored on insert and refreshed by reconciliation), which settles Pending
 * vs. terminal, but a `filled` order says nothing about whether the position it
 * opened is still held — a filled entry and a filled exit look identical in
 * that column. So the classification is a derived condition: order status
 * first, and for `filled` orders, whether the symbol still appears in the
 * broker's live positions.
 *
 *   Open     — filled, and the symbol is still held at the broker.
 *   Pending  — submitted/queued, not yet fully filled or confirmed.
 *   Rejected — the broker refused it. Its own bucket rather than a subgroup of
 *              the unfilled pile, because a rejection is the one ending that
 *              needs the user to do something: it carries a reason and a route
 *              back to a corrected order. Burying it in a collapsed section
 *              alongside routine cancellations is how a rejected order goes
 *              unnoticed.
 *   Closed   — filled and no longer held: a position that was exited/settled.
 *              A closed order's row is deleted outright once it's more than
 *              24 hours old — see `lib/portfolio/prune.ts` — so this section
 *              only ever shows what the database still has.
 *   Unfilled — ended without filling and without being refused: cancelled,
 *              expired, replaced, done for day. Routine endings, kept
 *              distinguishable inside the section by disposition.
 *
 * Open and Closed both depend on the live position list, so callers pass null
 * for it while it's still loading or its fetch failed. In that state a filled
 * order is never called Closed — see `classifyOrder`.
 *
 * "The symbol is still held" is necessary but not sufficient once a symbol
 * round-trips more than once in a window: it says nothing about *which*
 * filled orders for that symbol belong to the run currently open versus an
 * earlier one that already closed. Buy AAPL, sell it flat, buy AAPL again —
 * without more information, the first buy and the first sell would both
 * reclassify as Open the moment the second buy lands, because AAPL is held
 * again and that's all the coarse rule can see. `currentRunBoundaries`
 * resolves that by replaying each held symbol's filled orders and finding
 * where its current run began; `sectionOrders` computes it once per render
 * and `classifyOrder` uses it to tell the two runs apart. Only reachable
 * within a day, since a fully closed run's orders are gone after that.
 */

import type { BlendedPosition } from "./blend";

export type PositionSection = "open" | "pending" | "rejected" | "closed" | "unfilled";

/** The order fields sectioning needs — anything wider passes through intact. */
export interface SectionableOrder {
  symbol: string;
  status: string;
  created_at: string;
  /** Broker-accepted time, when reconciliation has recorded one. */
  broker_submitted_at?: string | null;
  /** Deterministic tiebreak for rows accepted in the same millisecond. */
  id?: string;
  /** "buy" | "sell". Optional so a caller not tracking round-trips can omit it. */
  side?: string | null;
  /** Shares/contracts actually filled. `numeric` columns arrive as strings over PostgREST. */
  filled_qty?: number | string | null;
}

export interface SectionedOrders<T> {
  open: T[];
  pending: T[];
  rejected: T[];
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

/**
 * Fixed display order for the unfilled section's disposition sub-groups.
 *
 * `rejected` is deliberately absent: rejections have their own section, so a
 * rejected order never reaches `groupByDisposition`. The disposition itself
 * stays defined above because `dispositionOf` is still the thing that
 * recognizes the status.
 */
export const DISPOSITION_ORDER: readonly Disposition[] = [
  "canceled",
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

/**
 * Symbols the broker currently reports a live position in, upper-cased.
 * Null in, null out: "we don't know what's held" is not the same as "nothing
 * is held", and the two must not collapse into one another.
 */
export function heldSymbols(blendedPositions: BlendedPosition[]): Set<string>;
export function heldSymbols(blendedPositions: BlendedPosition[] | null): Set<string> | null;
export function heldSymbols(blendedPositions: BlendedPosition[] | null): Set<string> | null {
  if (blendedPositions === null) return null;
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
 *
 * `held` is null when the broker's position list hasn't loaded or its fetch
 * failed — the paper account with no Alpaca keys configured gets a 503 from
 * /api/portfolio while /api/orders still returns rows. A filled order stays
 * Open in that case. Calling it Closed would assert the position was exited
 * on the strength of a snapshot we never received, and "you're flat" is the
 * more dangerous thing to be wrong about.
 *
 * `openBoundary` distinguishes a symbol's *current* open run from an earlier
 * one that already closed — see `currentRunBoundaries`. Undefined/null means
 * the boundary couldn't be determined (missing side/qty data, or the caller
 * didn't compute one at all), which falls back to "every filled order for a
 * held symbol is open" — the older, coarser rule. That's still correct for a
 * symbol on its first-ever run; it only under-classifies (marks a closed
 * round-trip as Open again) for a same-day flatten-and-reopen, and erring
 * toward Open is the same direction this function already errs in for
 * `held === null`.
 */
export function classifyOrder(
  order: SectionableOrder,
  held: ReadonlySet<string> | null,
  openBoundary?: number | null,
): PositionSection {
  const status = normalize(order.status);
  if (status === "rejected") return "rejected";
  if (dispositionOf(status)) return "unfilled";
  if (PENDING_STATUSES.has(status)) return "pending";
  if (status === "filled") {
    if (held === null) return "open";
    if (!held.has(order.symbol?.toUpperCase() ?? "")) return "closed";
    if (openBoundary == null) return "open";
    const t = acceptedTime(order);
    // No usable timestamp on this order: same fallback as no boundary at all.
    return t === null || t >= openBoundary ? "open" : "closed";
  }
  return "pending";
}

function parseQty(qty: number | string | null | undefined): number | null {
  if (qty === null || qty === undefined) return null;
  const n = typeof qty === "number" ? qty : Number(qty);
  return Number.isFinite(n) ? n : null;
}

/** Net quantity below this is treated as flat; guards against float drift. */
const QTY_EPSILON = 1e-6;

/**
 * When each currently-held symbol's *current* open run began, derived by
 * replaying its filled orders oldest → newest and tracking signed net
 * quantity — the same rule `lib/portfolio/opened-at.ts` uses for the broker's
 * raw fill-activity feed, applied here to order rows instead of individual
 * executions. That substitution is exact for this purpose: an order is
 * single-sided by construction, so a flatten-and-reopen always spans at least
 * two orders and never hides inside one.
 *
 * Only symbols in `held` are walked — a flat symbol has no "current run" to
 * bound, and every one of its filled orders is simply Closed regardless.
 *
 * `orders` is whatever window the caller fetched (capped at 200, newest
 * first, per `/api/orders`), not full history — but closed orders are pruned
 * after 24 hours (`lib/portfolio/prune.ts`), so the only orders that can
 * still be in that window are the current run plus, at most, whatever closed
 * within the last day. Two hundred rows in a day covers that with room to
 * spare for any account this app supports.
 *
 * A symbol is left out of the returned map — rather than given a wrong
 * boundary — when its fills don't carry usable side/qty data. `classifyOrder`
 * treats a missing boundary as "every filled order is open", so an
 * indeterminate replay fails toward the safer answer, not a confident wrong
 * one.
 */
export function currentRunBoundaries(
  orders: readonly SectionableOrder[],
  held: ReadonlySet<string>,
): Map<string, number> {
  const boundaries = new Map<string, number>();
  if (held.size === 0) return boundaries;

  const bySymbol = new Map<string, SectionableOrder[]>();
  for (const order of orders) {
    if (normalize(order.status) !== "filled" && normalize(order.status) !== "partially_filled") continue;
    const symbol = order.symbol?.toUpperCase();
    if (!symbol || !held.has(symbol)) continue;
    const list = bySymbol.get(symbol);
    if (list) list.push(order);
    else bySymbol.set(symbol, [order]);
  }

  for (const [symbol, symbolOrders] of bySymbol) {
    const fills = symbolOrders
      .map((o) => ({ side: normalize(o.side), qty: parseQty(o.filled_qty), t: acceptedTime(o) }))
      .filter((f): f is { side: string; qty: number; t: number } =>
        (f.side === "buy" || f.side === "sell") && f.qty !== null && f.qty > 0 && f.t !== null,
      )
      .sort((a, b) => a.t - b.t);

    // Fewer usable fills than orders means at least one had no side/qty/time
    // we could parse — the replay can't be trusted, so leave this symbol out.
    if (fills.length !== symbolOrders.length || fills.length === 0) continue;

    let net = 0;
    let boundary: number | null = null;
    for (const fill of fills) {
      const signed = fill.side === "buy" ? fill.qty : -fill.qty;
      const before = net;
      net += signed;
      const wasFlat = Math.abs(before) < QTY_EPSILON;
      const isFlat = Math.abs(net) < QTY_EPSILON;
      const reversed = !wasFlat && !isFlat && Math.sign(before) !== Math.sign(net);
      if (isFlat) boundary = null;
      else if (wasFlat || reversed) boundary = fill.t;
    }

    if (boundary !== null) boundaries.set(symbol, boundary);
  }

  return boundaries;
}

/**
 * Newest first, by the time the broker accepted the order, falling back to
 * when this app recorded it.
 *
 * The two are usually within a second of each other and diverge exactly when
 * it matters: an order queued before the open is accepted at 09:30, hours
 * after it was placed. A section listing what is live at the broker has to sort
 * on the broker's clock. Rows with no usable date sort last rather than
 * dropping out of view, and the id breaks ties so the order doesn't shuffle
 * between renders.
 */
function byNewestFirst(a: SectionableOrder, b: SectionableOrder): number {
  const ta = acceptedTime(a);
  const tb = acceptedTime(b);
  if (ta !== tb) {
    if (ta === null) return 1;
    if (tb === null) return -1;
    return tb - ta;
  }
  return (a.id ?? "").localeCompare(b.id ?? "");
}

function acceptedTime(order: SectionableOrder): number | null {
  const submitted = order.broker_submitted_at ? Date.parse(order.broker_submitted_at) : NaN;
  if (!Number.isNaN(submitted)) return submitted;
  const created = Date.parse(order.created_at);
  return Number.isNaN(created) ? null : created;
}

/**
 * Split orders into the four sections, each sorted newest first. The API
 * already returns `created_at desc`, but sorting here keeps each section
 * ordered no matter what order the caller hands them over in.
 *
 * Pass null for `blendedPositions` when the broker's position snapshot isn't
 * available, so no filled order gets reported as closed on the strength of a
 * list that never arrived.
 */
export function sectionOrders<T extends SectionableOrder>(
  orders: T[],
  blendedPositions: BlendedPosition[] | null,
): SectionedOrders<T> {
  const held = heldSymbols(blendedPositions);
  const boundaries = held === null ? null : currentRunBoundaries(orders, held);
  const sections: SectionedOrders<T> = {
    open: [],
    pending: [],
    rejected: [],
    closed: [],
    unfilled: [],
  };
  for (const order of orders) {
    const boundary = boundaries?.get(order.symbol?.toUpperCase() ?? "") ?? null;
    sections[classifyOrder(order, held, boundary)].push(order);
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

/**
 * Normalized order status, and reconciliation against the broker.
 * -----------------------------------------------------------------------------
 * Two problems live here, and they are the reason new orders stopped appearing
 * in the Portfolio's Pending list.
 *
 * 1. The broker's status vocabulary is wide (Alpaca alone emits ~15 values) and
 *    the UI needs six meanings out of it. `normalizeOrderStatus` collapses the
 *    vocabulary down, and — importantly — an unrecognized value becomes
 *    `unknown` rather than silently landing in a bucket that looks fine. A
 *    status we can't read is a sync problem the user should be able to see.
 *
 * 2. `orders` rows were written once, at submit time, and never updated. The
 *    status column therefore froze at whatever the broker said in the
 *    milliseconds after the order was accepted — usually `new` or `accepted`.
 *    Every order ever placed stayed "pending" forever, so the Pending panel
 *    filled up with months-old rows that had long since filled, cancelled or
 *    expired at the broker. `reconcileOrders` is the missing half: it diffs the
 *    local ledger against the broker's current order list and produces the
 *    updates that make the ledger true again.
 *
 * Both functions are pure so they can be tested without a broker or a database.
 */

/** The six meanings the UI renders. Everything else maps onto one of these. */
export type NormalizedStatus =
  | "pending"
  | "partially_filled"
  | "filled"
  | "rejected"
  | "canceled"
  | "unknown";

/**
 * Broker states that mean "this order is live and hasn't finished".
 *
 * `pending_cancel` and `pending_replace` are here because the original order is
 * still working until the cancel or replace is confirmed — showing it as gone
 * before the broker agrees is how a user ends up double-ordering.
 */
const PENDING: readonly string[] = [
  "new",
  "accepted",
  "accepted_for_bidding",
  "calculated",
  "held",
  "pending_cancel",
  "pending_new",
  "pending_replace",
  "pending_review",
  "stopped",
  "suspended",
];

/** Terminal states that ended the order without a position. */
const CANCELED: readonly string[] = [
  "canceled",
  "cancelled", // Alpaca spells it with one L; accept both
  "expired",
  "replaced",
  "done_for_day",
];

export function normalizeOrderStatus(raw: string | null | undefined): NormalizedStatus {
  const status = raw?.toLowerCase().trim() ?? "";
  if (status === "filled") return "filled";
  if (status === "partially_filled") return "partially_filled";
  if (status === "rejected") return "rejected";
  if (CANCELED.includes(status)) return "canceled";
  if (PENDING.includes(status)) return "pending";
  return "unknown";
}

/** True when the order is still working at the broker. */
export function isWorking(status: NormalizedStatus): boolean {
  return status === "pending" || status === "partially_filled";
}

export const STATUS_LABELS: Record<NormalizedStatus, string> = {
  pending: "Pending",
  partially_filled: "Partially filled",
  filled: "Filled",
  rejected: "Rejected",
  canceled: "Cancelled",
  unknown: "Sync error",
};

/** One plain sentence per state — what it means and what happens next. */
export const STATUS_DESCRIPTIONS: Record<NormalizedStatus, string> = {
  pending: "Sitting at the broker, waiting to fill. It hasn't cost you anything yet.",
  partially_filled: "Some of the quantity has filled; the rest is still working at the broker.",
  filled: "Completely filled. The position it opened is in Open Positions.",
  rejected: "The broker refused this order, so nothing was traded. Fix the problem and resubmit.",
  canceled: "This order ended without filling — pulled, replaced, or timed out.",
  unknown:
    "We couldn't match this order to the broker's records. It is not being treated as live — check the broker directly before resubmitting.",
};

export interface FillProgress {
  filledQty: number;
  totalQty: number;
  remainingQty: number;
  /** 0–100. Zero when the total quantity is unusable. */
  pct: number;
  label: string;
}

/** Fill progress for a partially-filled order, for the Pending row's detail. */
export function fillProgress(filledQty: number | null, totalQty: number | null): FillProgress {
  const filled = Number.isFinite(Number(filledQty)) ? Math.max(0, Number(filledQty)) : 0;
  const total = Number.isFinite(Number(totalQty)) ? Math.max(0, Number(totalQty)) : 0;
  const capped = total > 0 ? Math.min(filled, total) : filled;
  const remaining = Math.max(0, total - capped);
  const pct = total > 0 ? (capped / total) * 100 : 0;
  return {
    filledQty: capped,
    totalQty: total,
    remainingQty: remaining,
    pct,
    label: total > 0 ? `${capped} of ${total} filled · ${remaining} left` : `${capped} filled`,
  };
}

/** ---- Reconciliation ---------------------------------------------------- */

/** The local ledger fields reconciliation reads and writes. */
export interface LocalOrder {
  id: string;
  broker_order_id: string | null;
  status: string;
  filled_qty: number | null;
  filled_avg_price: number | null;
  created_at: string;
}

/** The broker order fields reconciliation reads. */
export interface BrokerOrder {
  id: string;
  status: string;
  filled_qty?: string | number | null;
  filled_avg_price?: string | number | null;
  submitted_at?: string | null;
  filled_at?: string | null;
  canceled_at?: string | null;
  expired_at?: string | null;
  failed_at?: string | null;
  /** Present on rejections; the broker's own explanation. */
  reject_reason?: string | null;
}

export interface OrderUpdate {
  /** Primary key of the local row to update. */
  id: string;
  status: string;
  filled_qty: number | null;
  filled_avg_price: number | null;
  /** Broker-accepted time, which is what Pending sorts on. */
  broker_submitted_at: string | null;
  reject_reason: string | null;
  last_synced_at: string;
}

export interface ReconcileResult {
  /** Rows whose broker state differs from what the ledger holds. */
  updates: OrderUpdate[];
  /**
   * Local rows still marked as working that the broker has no record of. These
   * become `unknown` rather than being left to look live forever.
   */
  orphanedIds: string[];
  /** Local rows already in agreement with the broker. */
  inSyncCount: number;
}

/**
 * Diff the local ledger against the broker's order list.
 *
 * Only working orders are chased. A row that already reached a terminal state
 * locally is left alone: terminal states don't change at the broker, and
 * re-writing them on every poll would rewrite `updated_at` for the whole
 * ledger on a ten-second timer.
 *
 * `brokerOrders` must be the *complete* set the broker returned for the window
 * being reconciled. Passing a partial page would mark every order outside it as
 * orphaned, which is why the caller pages the broker's list rather than taking
 * the first hundred.
 */
export function reconcileOrders(
  localOrders: LocalOrder[],
  brokerOrders: BrokerOrder[],
  now: Date = new Date(),
): ReconcileResult {
  const syncedAt = now.toISOString();
  const byBrokerId = new Map(brokerOrders.map((o) => [String(o.id), o]));

  const updates: OrderUpdate[] = [];
  const orphanedIds: string[] = [];
  let inSyncCount = 0;

  for (const local of localOrders) {
    if (!isWorking(normalizeOrderStatus(local.status))) continue;

    const broker = local.broker_order_id ? byBrokerId.get(local.broker_order_id) : undefined;
    if (!broker) {
      // Never mirrored (no broker id), or the broker has no record of it. Either
      // way it is not a live order and must stop being presented as one.
      orphanedIds.push(local.id);
      continue;
    }

    const filledQty = numOrNull(broker.filled_qty);
    const filledAvgPrice = numOrNull(broker.filled_avg_price);
    const brokerStatus = String(broker.status ?? "").toLowerCase().trim();

    const unchanged =
      brokerStatus === local.status?.toLowerCase().trim() &&
      sameNumber(filledQty, local.filled_qty) &&
      sameNumber(filledAvgPrice, local.filled_avg_price);

    if (unchanged) {
      inSyncCount++;
      continue;
    }

    updates.push({
      id: local.id,
      status: brokerStatus || local.status,
      filled_qty: filledQty,
      filled_avg_price: filledAvgPrice,
      broker_submitted_at: broker.submitted_at ?? null,
      reject_reason: broker.reject_reason ?? null,
      last_synced_at: syncedAt,
    });
  }

  return { updates, orphanedIds, inSyncCount };
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function sameNumber(a: number | null, b: number | null): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(a - b) < 1e-9;
}

/**
 * Sort key for a pending order: when the broker accepted it, falling back to
 * when we recorded it.
 *
 * Placement time and broker-accepted time are usually within a second of each
 * other, but they diverge exactly when it matters — a queued pre-market order
 * is accepted at the open, hours after it was placed. Pending is a list of
 * what is live at the broker, so it sorts on the broker's clock.
 */
export function acceptedAt(order: { broker_submitted_at?: string | null; created_at: string }): number {
  const submitted = order.broker_submitted_at ? Date.parse(order.broker_submitted_at) : NaN;
  if (!Number.isNaN(submitted)) return submitted;
  const created = Date.parse(order.created_at);
  return Number.isNaN(created) ? -Infinity : created;
}

/**
 * Newest first, with the row id as a deterministic tiebreak so two orders
 * accepted in the same millisecond don't swap places between renders.
 */
export function byNewestAccepted<T extends { id: string; broker_submitted_at?: string | null; created_at: string }>(
  a: T,
  b: T,
): number {
  const ta = acceptedAt(a);
  const tb = acceptedAt(b);
  if (ta !== tb) {
    // An unparseable date sorts last rather than dropping out of view.
    if (ta === -Infinity) return 1;
    if (tb === -Infinity) return -1;
    return tb - ta;
  }
  return a.id.localeCompare(b.id);
}

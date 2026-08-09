/**
 * Settling pending trade logs.
 * -----------------------------------------------------------------------------
 * A `trade_logs` row is written when a trade *ends* — a market close, a stop
 * that took the position out, the last tranche of a staged exit clearing. At
 * that moment the exit price does not exist yet: the liquidation has been
 * accepted by the broker, not filled. The row therefore lands with
 * `outcome = 'pending'` and `exit_condition = 'pending'`, and until now nothing
 * ever came back for it. Every such row stayed pending forever, so the trade
 * log — the thing realized P/L and signal-adherence reporting read — never had
 * a settled row in it.
 *
 * This is the missing half. It matches a pending row against the broker's own
 * fill activities and writes back what actually happened: the quantity-weighted
 * exit price, the realized P/L, which protocol level produced the exit, and
 * whether the signal was followed.
 *
 * What it will not do
 * -------------------
 * Invent an exit. A row whose closing fills can't be found, or are only
 * partially in (a staged exit still has tranches working), is left pending and
 * *reported* as pending. The caller surfaces the count. A fabricated exit price
 * in a trade log is worse than an absent one: it is a number someone will
 * measure a strategy against.
 *
 * Matching window
 * ---------------
 * Closing fills are taken from the row's entry timestamp forward, oldest first.
 * The broker nets to one position per symbol, so a trade's own exits are always
 * the earliest closing fills after its entry — a later trade in the same symbol
 * can only have opened after this one was flat, and its fills are only ever
 * reached if this row's quantity has already been covered, which it hasn't been
 * while there is anything left to consume.
 *
 * The pure core is `settleTradeLog`; everything below it is the database and
 * broker shell.
 */

import type { AlpacaCreds, AlpacaFillActivity, AlpacaOrder } from "@/lib/brokers/alpaca";
import { getOrders, listFillActivities } from "@/lib/brokers/alpaca";
import { classifyExit, computeRealizedPl, type ExitCondition } from "@/lib/portfolio/reconcile";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** The pending-row fields settlement reads. */
export interface PendingTradeLog {
  id: string;
  symbol: string;
  /** The entry side. Closing fills are the opposite of this. */
  direction: "buy" | "sell";
  quantity: number;
  entry_price: number;
  entry_timestamp: string;
  created_at: string;
}

/** One execution, as the broker's activity feed reports it. */
export interface ExitFill {
  orderId: string | null;
  symbol: string;
  side: "buy" | "sell";
  qty: number;
  price: number;
  at: string;
}

/** The order fields needed to say *which* level produced an exit. */
export interface ExitOrderInfo {
  id: string;
  type: string;
  order_class?: string;
}

export interface TradeLogSettlement {
  id: string;
  exit_timestamp: string;
  exit_price: number;
  outcome: "profit" | "loss";
  profit_loss_dollars: number;
  profit_loss_percent: number;
  exit_condition: ExitCondition;
  signal_adherence: "yes" | null;
}

export type SettleOutcome =
  | { settled: TradeLogSettlement }
  | {
      settled: null;
      /**
       * `no_exit_fills` — nothing has closed this position yet.
       * `partial_exit` — a staged exit is under way; some tranches are still working.
       */
      reason: "no_exit_fills" | "partial_exit";
      exitedQty: number;
    };

const EPSILON = 1e-9;

/**
 * Resolve one pending row against the fills the broker reports.
 *
 * Settles only on a *complete* exit. A protocol trade leaves in tranches — 60%
 * at TP1, then the master target, then the runner — and a trade log carries one
 * exit price for one trade. Averaging in a 60% fill while 40% is still open
 * would report a closed trade that is still live, so the row waits until the
 * position is actually flat and then reports the quantity-weighted average of
 * every fill that closed it.
 */
export function settleTradeLog(
  log: PendingTradeLog,
  fills: ExitFill[],
  orders: ExitOrderInfo[] = [],
): SettleOutcome {
  const closingSide = log.direction === "buy" ? "sell" : "buy";
  const since = Date.parse(log.entry_timestamp) || 0;

  const candidates = fills
    .filter(
      (f) =>
        f.symbol.toUpperCase() === log.symbol.toUpperCase() &&
        f.side === closingSide &&
        Number.isFinite(f.qty) &&
        f.qty > 0 &&
        Number.isFinite(f.price) &&
        f.price > 0 &&
        (Date.parse(f.at) || 0) >= since,
    )
    .sort((a, b) => (Date.parse(a.at) || 0) - (Date.parse(b.at) || 0));

  if (candidates.length === 0) {
    return { settled: null, reason: "no_exit_fills", exitedQty: 0 };
  }

  // Consume oldest-first up to the logged quantity. The last fill can be split:
  // a liquidation that closed more than this row covers (two positions in one
  // symbol) contributes only the part that belongs here.
  let remaining = log.quantity;
  let notional = 0;
  let consumed = 0;
  let lastFill: ExitFill | null = null;
  for (const fill of candidates) {
    if (remaining <= EPSILON) break;
    const take = Math.min(fill.qty, remaining);
    notional += take * fill.price;
    consumed += take;
    remaining -= take;
    lastFill = fill;
  }

  if (remaining > EPSILON) {
    return { settled: null, reason: "partial_exit", exitedQty: consumed };
  }

  const exitPrice = notional / consumed;
  const side = log.direction === "buy" ? "long" : "short";
  const realizedPl = computeRealizedPl(log.entry_price, exitPrice, consumed, side);
  const basis = log.entry_price * consumed;

  const closingOrder = lastFill?.orderId
    ? orders.find((o) => String(o.id) === String(lastFill!.orderId))
    : undefined;
  const exitCondition: ExitCondition = closingOrder
    ? classifyExit({ type: closingOrder.type, order_class: closingOrder.order_class })
    : "manual";

  return {
    settled: {
      id: log.id,
      exit_timestamp: lastFill!.at,
      exit_price: exitPrice,
      outcome: realizedPl >= 0 ? "profit" : "loss",
      profit_loss_dollars: realizedPl,
      profit_loss_percent: basis > 0 ? (realizedPl / basis) * 100 : 0,
      exit_condition: exitCondition,
      // An exit that came from a resting protocol leg is the signal being
      // followed. A manual liquidation says nothing either way, so it records
      // nothing rather than guessing.
      signal_adherence: exitCondition === "manual" ? null : "yes",
    },
  };
}

/** ---- Database and broker shell ------------------------------------------ */

export interface SettlementRun {
  /** Rows that were completed on this pass. */
  settled: number;
  /** Rows still waiting on the broker — reported, never fabricated. */
  stillPending: number;
  /** Non-null when the broker couldn't be read, so the counts are incomplete. */
  error: string | null;
}

/** How far back to read fills when settling. */
const FILL_WINDOW_DAYS = 90;

/**
 * Complete every pending trade log this user has, as far as the broker's
 * records allow.
 *
 * Costs nothing when there is nothing pending: the broker is only called after
 * the pending set comes back non-empty, so the common case is a single indexed
 * `select` that returns no rows.
 */
export async function settlePendingTradeLogs(
  supabase: Supabase,
  creds: AlpacaCreds,
  userId: string,
): Promise<SettlementRun> {
  const { data: pendingRows, error: readError } = await supabase
    .from("trade_logs")
    .select("id, symbol, direction, quantity, entry_price, entry_timestamp, created_at")
    .eq("user_id", userId)
    .eq("outcome", "pending")
    .order("created_at", { ascending: true })
    .limit(200);

  if (readError) {
    return { settled: 0, stillPending: 0, error: readError.message };
  }
  const pending = (pendingRows ?? []) as PendingTradeLog[];
  if (pending.length === 0) return { settled: 0, stillPending: 0, error: null };

  let fills: ExitFill[];
  let orders: ExitOrderInfo[];
  try {
    const since = new Date(Date.now() - FILL_WINDOW_DAYS * 24 * 3600 * 1000);
    const [activities, closed] = await Promise.all([
      listFillActivities(creds, { since }),
      getOrders(creds, "closed").catch(() => [] as AlpacaOrder[]),
    ]);
    fills = toExitFills(activities);
    orders = (closed as AlpacaOrder[]).map((o) => ({
      id: String(o.id),
      type: String(o.type ?? ""),
      order_class: o.order_class,
    }));
  } catch (err) {
    console.error(
      `trade-log: fill history unavailable — ${err instanceof Error ? err.message : String(err)}`,
    );
    return {
      settled: 0,
      stillPending: pending.length,
      error: `Couldn't read the broker's fill history, so ${pending.length} trade log${
        pending.length === 1 ? "" : "s"
      } stayed pending.`,
    };
  }

  const updates: TradeLogSettlement[] = [];
  let stillPending = 0;
  for (const log of pending) {
    const outcome = settleTradeLog(normalize(log), fills, orders);
    if (outcome.settled) updates.push(outcome.settled);
    else stillPending++;
  }

  if (updates.length === 0) return { settled: 0, stillPending, error: null };

  const results = await Promise.all(
    updates.map(({ id, ...fields }) =>
      supabase
        .from("trade_logs")
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", userId),
    ),
  );
  const writeError = results.find((r) => r.error)?.error;
  if (writeError) {
    console.error(`trade-log: settlement write failed — ${writeError.message}`);
    return {
      settled: 0,
      stillPending: pending.length,
      error: "The broker's exit prices were read but couldn't be saved to the trade log.",
    };
  }

  return { settled: updates.length, stillPending, error: null };
}

/** Alpaca sends every number as a string; the pure core wants numbers. */
function normalize(row: PendingTradeLog): PendingTradeLog {
  return {
    ...row,
    quantity: Number(row.quantity),
    entry_price: Number(row.entry_price),
  };
}

export function toExitFills(activities: AlpacaFillActivity[]): ExitFill[] {
  return activities
    .filter((a) => a.price != null && a.qty != null)
    .map((a) => ({
      orderId: a.order_id ?? null,
      symbol: a.symbol,
      // A short sale is a sell for position-direction purposes.
      side: a.side === "buy" ? ("buy" as const) : ("sell" as const),
      qty: Number(a.qty),
      price: Number(a.price),
      at: a.transaction_time,
    }));
}

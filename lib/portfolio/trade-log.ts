/**
 * A closed trade, in the shape `trade_logs` stores.
 *
 * `/api/trade-log` has existed since migration 0002 and nothing has ever POSTed
 * to it, so the audit trail it backs has always been empty — and so has the
 * outcome half of every learning row. This builds the record from the two things
 * actually in hand when a position is closed: the local position row (what was
 * entered, at what price, when) and the broker's closing order (what came back).
 *
 * Pure so it can be tested without a broker or a database. The rules it encodes:
 *
 *   - **An unknown exit price is `pending`, not zero.** A close order can come
 *     back accepted but unfilled; recording a fabricated exit would put a wrong
 *     P/L into the audit trail and label a trade that has not resolved.
 *   - **Outcome follows the direction of the trade.** A short that exits below
 *     its entry is a profit, and a table that read every fall as a loss would
 *     mislabel exactly the trades hardest to get right.
 *   - **`manual` is the honest exit condition here.** The close endpoint is the
 *     user pressing the button; whether price happened to be at TP1 at that
 *     moment is not the same thing as the target having filled.
 */

export interface ClosablePosition {
  id?: string | null;
  symbol: string;
  asset_class?: string | null;
  qty: number;
  avg_entry_price: number;
  opened_at?: string | null;
  /** "buy" for a long, "sell" for a short. Longs are the default. */
  side?: "buy" | "sell" | null;
}

export interface TradeLogRow {
  user_id: string;
  position_id: string | null;
  symbol: string;
  asset_class: string;
  direction: "buy" | "sell";
  quantity: number;
  entry_timestamp: string;
  entry_price: number;
  exit_timestamp: string | null;
  exit_price: number | null;
  outcome: "profit" | "loss" | "pending";
  profit_loss_dollars: number | null;
  profit_loss_percent: number | null;
  exit_condition: "manual" | "pending";
  signal_called: string;
}

export function buildTradeLogRow(input: {
  userId: string;
  position: ClosablePosition;
  /** Quantity actually closed; defaults to the whole position. */
  closedQty?: number;
  exitPrice?: number;
  exitAt?: string;
  /** What the protocol said about this symbol when the position was opened. */
  signalCalled?: string;
}): TradeLogRow {
  const { userId, position, closedQty, exitPrice, exitAt, signalCalled } = input;

  const direction = position.side === "sell" ? "sell" : "buy";
  const quantity = closedQty ?? position.qty;
  const entryPrice = position.avg_entry_price;
  const resolved = typeof exitPrice === "number" && Number.isFinite(exitPrice) && exitPrice > 0;

  // A long makes money going up, a short going down. One sign flip, and the
  // only reason short outcomes are not silently inverted.
  const perShare = resolved ? (direction === "buy" ? exitPrice - entryPrice : entryPrice - exitPrice) : null;
  const dollars = perShare === null ? null : perShare * quantity;
  const percent = perShare === null || entryPrice === 0 ? null : (perShare / entryPrice) * 100;

  return {
    user_id: userId,
    position_id: position.id ?? null,
    symbol: position.symbol.toUpperCase(),
    asset_class: position.asset_class ?? "us_equity",
    direction,
    quantity,
    entry_timestamp: position.opened_at ?? new Date().toISOString(),
    entry_price: entryPrice,
    exit_timestamp: resolved ? exitAt ?? new Date().toISOString() : null,
    exit_price: resolved ? exitPrice : null,
    outcome: dollars === null ? "pending" : dollars >= 0 ? "profit" : "loss",
    profit_loss_dollars: dollars === null ? null : round(dollars),
    profit_loss_percent: percent === null ? null : round(percent),
    exit_condition: resolved ? "manual" : "pending",
    signal_called: signalCalled ?? "manual close",
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Writing the trade log at the moment a trade ends.
 *
 * Three things end a trade: the user closing it at market, the protocol's own
 * exit rules taking the last tranche out, and a stop or target filling at the
 * broker while nobody is watching. All three land here, and all three write the
 * same shape of row — the entry facts, which are known, and a pending exit,
 * which is not.
 *
 * The exit is deliberately left empty. At the instant a position is liquidated
 * the fill has not happened yet; writing the last quote into `exit_price` would
 * put a number in the audit trail that no execution ever produced.
 * `settlePendingTradeLogs` comes back for it once the broker reports the fill.
 */

import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface PendingExitLog {
  symbol: string;
  assetClass?: string;
  /** The entry side: `buy` for a long, `sell` for a short. */
  direction: "buy" | "sell";
  quantity: number;
  entryPrice: number;
  entryTimestamp?: string | null;
  positionId?: string | null;
  orderId?: string | null;
  /** What was called at entry. Required by the table, so it is never blank. */
  signalCalled: string;
}

/**
 * Record a trade that has just been closed out, exit unknown.
 *
 * Returns the row id, or null when the write failed — a failure is logged and
 * swallowed rather than propagated, because the exit itself has already
 * happened at the broker and an audit-trail failure must not be reported to
 * the user as a failed close.
 */
export async function recordPendingExit(
  supabase: Supabase,
  userId: string,
  input: PendingExitLog,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("trade_logs")
    .insert({
      user_id: userId,
      symbol: input.symbol.toUpperCase(),
      asset_class: input.assetClass ?? "us_equity",
      direction: input.direction,
      quantity: input.quantity,
      entry_timestamp: input.entryTimestamp ?? new Date().toISOString(),
      entry_price: input.entryPrice,
      position_id: input.positionId ?? null,
      order_id: input.orderId ?? null,
      exit_timestamp: null,
      exit_price: null,
      outcome: "pending",
      exit_condition: "pending",
      signal_called: input.signalCalled,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    console.error(`trade-log: exit for ${input.symbol} not recorded — ${error.message}`);
    return null;
  }
  return data?.id ? String(data.id) : null;
}

/** How a protocol entry is described in the log, from the levels it was given. */
export function describeProtocolSignal(levels: {
  stopLoss: number;
  takeProfit1: number;
  masterProfit?: number | null;
}): string {
  const usd = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
  const master = levels.masterProfit != null ? `, master ${usd(levels.masterProfit)}` : "";
  return `Protocol levels — stop ${usd(levels.stopLoss)}, TP1 ${usd(levels.takeProfit1)}${master}`;
}

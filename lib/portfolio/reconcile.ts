/**
 * Position reconciliation: compares live Alpaca positions against our own
 * `positions` ledger, so opens/closes get recorded without requiring a broker
 * webhook. A close also derives its exit_condition and writes a `trade_logs`
 * row.
 *
 * Scope: full closes only (a symbol disappearing from live positions).
 * Partial fills that merely shrink a position's qty are not reconciled here.
 *
 * Status: `reconcilePositions` is not called from anywhere. It was written for
 * a portfolio poll that reads the `positions` ledger, and the app reads
 * positions straight from the broker instead, so nothing ever populated that
 * ledger for it to diff against. What actually records a finished trade today
 * is `lib/trade/exit-manager.ts` (which retires a staged exit when the broker
 * shows the symbol flat) and `/api/positions/close`; both write the exit as
 * pending and let `lib/portfolio/trade-log-settle.ts` fill in the real fill
 * price. `classifyExit` and `computeRealizedPl` below are used by that path and
 * are covered by tests — don't delete them with the rest.
 */

import type { AlpacaCreds } from "@/lib/brokers/alpaca";
import { getOrders } from "@/lib/brokers/alpaca";
import { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface LivePosition {
  symbol: string;
  qty: number;
  side: "long" | "short";
  avgEntry: number;
}

interface AlpacaOrderRow {
  id: string;
  symbol: string;
  type: string;
  order_class?: string;
  status: string;
  filled_avg_price: string | null;
  filled_qty: string | null;
  filled_at: string | null;
  created_at: string;
}

interface PositionRow {
  id: string;
  symbol: string;
  asset_class: string;
  side: "long" | "short";
  qty: number;
  avg_entry_price: number;
  opened_at: string;
  scan_result_id: string | null;
}

export type ExitCondition = "tp1" | "stop_loss" | "manual";

/** A bracket leg's own `type` tells us which side of the bracket filled. */
export function classifyExit(order: Pick<AlpacaOrderRow, "type" | "order_class">): ExitCondition {
  if (order.order_class !== "bracket") return "manual";
  if (order.type === "stop" || order.type === "stop_limit") return "stop_loss";
  if (order.type === "limit") return "tp1";
  return "manual";
}

export function computeRealizedPl(
  entryPrice: number,
  exitPrice: number,
  qty: number,
  side: "long" | "short",
): number {
  const diff = side === "long" ? exitPrice - entryPrice : entryPrice - exitPrice;
  return diff * qty;
}

/** Automatic exits (hit a called level) confirm the signal was followed. */
function signalAdherenceFor(exitCondition: ExitCondition): "yes" | null {
  return exitCondition === "manual" ? null : "yes";
}

export async function reconcilePositions(
  supabase: Supabase,
  creds: AlpacaCreds,
  userId: string,
  livePositions: LivePosition[],
): Promise<void> {
  const { data: openRows } = await supabase
    .from("positions")
    .select("*")
    .eq("user_id", userId)
    .eq("closed", false);
  const openBySymbol = new Map((openRows ?? []).map((r) => [r.symbol, r]));
  const liveBySymbol = new Map(livePositions.map((p) => [p.symbol, p]));

  const newlyOpened = livePositions.filter((p) => !openBySymbol.has(p.symbol));
  const newlyClosed = (openRows ?? []).filter((r) => !liveBySymbol.has(r.symbol));

  await Promise.all([
    ...newlyOpened.map((p) => recordOpen(supabase, userId, p)),
    ...newlyClosed.map((r) => recordClose(supabase, creds, userId, r)),
  ]);
}

async function recordOpen(supabase: Supabase, userId: string, live: LivePosition): Promise<void> {
  const { data: order } = await supabase
    .from("orders")
    .select("*")
    .eq("user_id", userId)
    .eq("symbol", live.symbol)
    .eq("side", live.side === "long" ? "buy" : "sell")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  await supabase.from("positions").insert({
    user_id: userId,
    connection_id: order?.connection_id ?? null,
    mode: order?.mode ?? "paper",
    symbol: live.symbol,
    asset_class: order?.asset_class ?? "us_equity",
    side: live.side,
    qty: live.qty,
    avg_entry_price: live.avgEntry,
    stop_loss: order?.stop_price ?? null,
    take_profit: order?.take_profit ?? null,
    master_profit: order?.master_profit ?? null,
    scan_result_id: order?.scan_result_id ?? null,
    closed: false,
    opened_at: order?.created_at ?? new Date().toISOString(),
  });
}

async function recordClose(
  supabase: Supabase,
  creds: AlpacaCreds,
  userId: string,
  openRow: PositionRow,
): Promise<void> {
  const closedOrders: AlpacaOrderRow[] = await getOrders(creds, "closed").catch(() => []);

  const closingOrder = closedOrders
    .filter(
      (o) =>
        o.symbol === openRow.symbol &&
        o.status === "filled" &&
        o.filled_at &&
        new Date(o.filled_at) > new Date(openRow.opened_at),
    )
    .sort((a, b) => new Date(b.filled_at!).getTime() - new Date(a.filled_at!).getTime())[0];

  if (!closingOrder) {
    // Closed outside any order we tracked (e.g. via the broker directly) —
    // mark it closed without fabricating an exit price or P/L.
    await supabase
      .from("positions")
      .update({ closed: true, closed_at: new Date().toISOString() })
      .eq("id", openRow.id);
    return;
  }

  const exitCondition = classifyExit(closingOrder);
  const exitPrice = Number(closingOrder.filled_avg_price);
  const realizedPl = computeRealizedPl(
    Number(openRow.avg_entry_price),
    exitPrice,
    Number(openRow.qty),
    openRow.side,
  );

  await supabase
    .from("positions")
    .update({ closed: true, closed_at: closingOrder.filled_at, realized_pl: realizedPl })
    .eq("id", openRow.id);

  let signalCalled = "Manual entry (no linked scan)";
  if (openRow.scan_result_id) {
    const { data: scan } = await supabase
      .from("scan_results")
      .select("direction, output_state, score")
      .eq("id", openRow.scan_result_id)
      .maybeSingle();
    if (scan) signalCalled = `${scan.output_state} ${scan.direction} @ score ${scan.score}`;
  }

  await supabase.from("trade_logs").insert({
    user_id: userId,
    position_id: openRow.id,
    symbol: openRow.symbol,
    asset_class: openRow.asset_class,
    direction: openRow.side === "long" ? "buy" : "sell",
    quantity: Number(openRow.qty),
    entry_timestamp: openRow.opened_at,
    entry_price: Number(openRow.avg_entry_price),
    exit_timestamp: closingOrder.filled_at,
    exit_price: exitPrice,
    outcome: realizedPl >= 0 ? "profit" : "loss",
    profit_loss_dollars: realizedPl,
    profit_loss_percent: (realizedPl / (Number(openRow.avg_entry_price) * Number(openRow.qty))) * 100,
    exit_condition: exitCondition,
    signal_called: signalCalled,
    signal_adherence: signalAdherenceFor(exitCondition),
  });
}

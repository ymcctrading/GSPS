/**
 * Position reconciliation: compares live Alpaca positions against our own
 * `positions` ledger on every portfolio poll, so opens/closes get recorded
 * without requiring a broker webhook. A close also derives its
 * exit_condition and writes a `trade_logs` row — this is what makes the
 * portfolio's realized P/L and "actual trigger type" fields real instead
 * of stubbed.
 *
 * Scope: full closes only (a symbol disappearing from live positions).
 * Partial fills that merely shrink a position's qty are not reconciled here
 * — `/api/positions/close` records those itself, since this function will
 * never see them (see the comment on `isFullClose` in trade-log.ts).
 *
 * Called from `GET /api/portfolio`, which the Portfolio page polls every
 * 10 seconds — that poll is what makes this run at all. It has no other
 * caller, so a broken import here silently stops trade_logs from ever
 * gaining an exit price, exactly as it did before anything called this file.
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

export interface ReconcileOutcome {
  opened: number;
  closed: number;
  /** Null when every write succeeded. The detail is in the server logs. */
  error: string | null;
}

export async function reconcilePositions(
  supabase: Supabase,
  creds: AlpacaCreds,
  userId: string,
  livePositions: LivePosition[],
): Promise<ReconcileOutcome> {
  const { data: openRows, error: readError } = await supabase
    .from("positions")
    .select("*")
    .eq("user_id", userId)
    .eq("closed", false);

  if (readError) {
    return { opened: 0, closed: 0, error: readError.message };
  }

  const openBySymbol = new Map((openRows ?? []).map((r) => [r.symbol, r]));
  const liveBySymbol = new Map(livePositions.map((p) => [p.symbol, p]));

  const newlyOpened = livePositions.filter((p) => !openBySymbol.has(p.symbol));
  const newlyClosed = (openRows ?? []).filter((r) => !liveBySymbol.has(r.symbol));

  // allSettled rather than all: one symbol's write failing (a transient
  // Supabase error, most likely) must not stop the others from being
  // recorded, and the caller needs to know a write was lost rather than have
  // it disappear into a rejected Promise.all.
  const [openResults, closeResults] = await Promise.all([
    Promise.allSettled(newlyOpened.map((p) => recordOpen(supabase, userId, p))),
    Promise.allSettled(newlyClosed.map((r) => recordClose(supabase, creds, userId, r))),
  ]);

  const failures = [...openResults, ...closeResults].filter(
    (r): r is PromiseRejectedResult => r.status === "rejected",
  );
  for (const f of failures) {
    console.error(
      `reconcilePositions: ${f.reason instanceof Error ? f.reason.message : String(f.reason)}`,
    );
  }

  return {
    opened: openResults.filter((r) => r.status === "fulfilled").length,
    closed: closeResults.filter((r) => r.status === "fulfilled").length,
    error:
      failures.length > 0
        ? `${failures.length} of ${newlyOpened.length + newlyClosed.length} reconciliation write(s) failed — see server logs.`
        : null,
  };
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

  // The Supabase client resolves with `{ error }` rather than rejecting, so a
  // failed insert would otherwise vanish silently instead of showing up as a
  // rejection in reconcilePositions' Promise.allSettled.
  const { error } = await supabase.from("positions").insert({
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
  if (error) throw new Error(`positions insert for ${live.symbol} failed: ${error.message}`);
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
    const { error } = await supabase
      .from("positions")
      .update({ closed: true, closed_at: new Date().toISOString() })
      .eq("id", openRow.id);
    if (error) throw new Error(`positions close for ${openRow.symbol} failed: ${error.message}`);
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

  let signalCalled = "Manual entry (no linked scan)";
  if (openRow.scan_result_id) {
    const { data: scan } = await supabase
      .from("scan_results")
      .select("direction, output_state, score")
      .eq("id", openRow.scan_result_id)
      .maybeSingle();
    if (scan) signalCalled = `${scan.output_state} ${scan.direction} @ score ${scan.score}`;
  }

  // Written before the position is marked closed, deliberately. Once
  // `closed: true` lands, this row drops out of `openBySymbol` on every
  // future poll and recordClose never runs for it again — so if the
  // trade_logs insert below failed *after* the position-close write, the
  // audit row would be lost permanently rather than retried. Failing here
  // instead leaves the position open for the next poll to try again. A
  // failure on this exact retry, immediately after the first insert
  // succeeded, can in principle double-write the row; that is a visible,
  // auditable duplicate, which is the safer failure to risk.
  const { error: logError } = await supabase.from("trade_logs").insert({
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
  if (logError) throw new Error(`trade_logs insert for ${openRow.symbol} failed: ${logError.message}`);

  const { error: closeError } = await supabase
    .from("positions")
    .update({ closed: true, closed_at: closingOrder.filled_at, realized_pl: realizedPl })
    .eq("id", openRow.id);
  if (closeError) {
    throw new Error(`positions close for ${openRow.symbol} failed: ${closeError.message}`);
  }
}

/**
 * Loads live `IntradayGateInputs` (lib/promotion/pro-intraday.ts) for one
 * user from Supabase, so `lib/trade/place-order.ts` has something real to
 * evaluate the gates against.
 *
 * "Today" throughout is the America/New_York trading day (`etDateKey`), not
 * the UTC day — the same boundary the rest of the scan/session code uses, so
 * a gate that "resets at the next trading day" resets at the same moment a
 * user would expect from everywhere else in the app.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { etDateKey } from "@/lib/market/session";
import { STARTING_CASH } from "@/lib/brokers/simulator";
import type { IntradayGateInputs } from "@/lib/promotion/pro-intraday";

type Supabase = SupabaseClient;

/** Recent-history window wide enough to cover today's orders plus a consecutive-loss streak that started yesterday. */
const LOOKBACK_DAYS = 10;
const CONSECUTIVE_LOSS_SCAN_LIMIT = 20;

function lookbackIso(): string {
  return new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();
}

/**
 * Rough paper-account equity: cash + cost basis of open positions. Not a
 * live mark-to-market (that would require a quote per open symbol just to
 * evaluate an order gate), but adequate for a percentage loss-lock threshold
 * — the daily-loss-lock gate only needs to know roughly what slice of the
 * account today's intraday losses represent, not a precise NLV.
 */
async function estimatePaperEquity(supabase: Supabase, userId: string): Promise<number> {
  const [{ data: account }, { data: positions }] = await Promise.all([
    supabase.from("paper_accounts").select("cash").eq("user_id", userId).maybeSingle(),
    supabase
      .from("positions")
      .select("qty, avg_entry_price")
      .eq("user_id", userId)
      .eq("mode", "paper")
      .eq("closed", false),
  ]);
  const cash = Number(account?.cash ?? STARTING_CASH);
  const holdingsValue = (positions ?? []).reduce(
    (sum, p: { qty: number; avg_entry_price: number }) => sum + Math.abs(Number(p.qty)) * Number(p.avg_entry_price),
    0,
  );
  return cash + holdingsValue;
}

export async function loadIntradayGateInputs(
  supabase: Supabase,
  userId: string,
): Promise<IntradayGateInputs> {
  const today = etDateKey();

  const [{ data: recentOrders }, equity] = await Promise.all([
    supabase
      .from("orders")
      .select("id, symbol, status, created_at")
      .eq("user_id", userId)
      .eq("mode", "paper")
      .eq("intraday_sourced", true)
      .gte("created_at", lookbackIso())
      .order("created_at", { ascending: false }),
    estimatePaperEquity(supabase, userId),
  ]);

  const orders = (recentOrders ?? []) as { id: string; symbol: string; status: string; created_at: string }[];

  const todaysOrders = orders.filter((o) => etDateKey(new Date(o.created_at)) === today);
  const entriesToday = todaysOrders.filter((o) => o.status !== "rejected").length;

  // Concurrent-position gate: of the symbols that have an intraday-sourced
  // filled order, how many still have an open position. This is an
  // approximation — it can't distinguish "still open from that entry" from
  // "closed and reopened manually since" without a direct order→position
  // link, which the schema doesn't carry — but it's conservative in the
  // direction that matters: it only ever counts a symbol the user actually
  // opened via an intraday alert.
  const intradaySymbols = Array.from(
    new Set(orders.filter((o) => o.status === "filled").map((o) => o.symbol.toUpperCase())),
  );
  let openPositions = 0;
  if (intradaySymbols.length > 0) {
    const { data: openRows } = await supabase
      .from("positions")
      .select("symbol")
      .eq("user_id", userId)
      .eq("mode", "paper")
      .eq("closed", false)
      .in("symbol", intradaySymbols);
    openPositions = (openRows ?? []).length;
  }

  // Consecutive-loss / daily realized P&L: trade_logs rows whose originating
  // order was intraday-sourced, newest first.
  const orderIds = orders.map((o) => o.id);
  let consecutiveLosses = 0;
  let realizedPnlTodayUsd = 0;
  if (orderIds.length > 0) {
    const { data: closedTrades } = await supabase
      .from("trade_logs")
      .select("order_id, outcome, profit_loss_dollars, exit_timestamp")
      .in("order_id", orderIds)
      .in("outcome", ["profit", "loss"])
      .order("exit_timestamp", { ascending: false })
      .limit(CONSECUTIVE_LOSS_SCAN_LIMIT);

    const trades = (closedTrades ?? []) as {
      order_id: string;
      outcome: "profit" | "loss";
      profit_loss_dollars: number | null;
      exit_timestamp: string | null;
    }[];

    for (const t of trades) {
      if (t.outcome === "loss") consecutiveLosses++;
      else break;
    }

    for (const t of trades) {
      if (t.exit_timestamp && etDateKey(new Date(t.exit_timestamp)) === today) {
        realizedPnlTodayUsd += Number(t.profit_loss_dollars ?? 0);
      }
    }
  }

  return { entriesToday, openPositions, consecutiveLosses, realizedPnlTodayUsd, equity };
}

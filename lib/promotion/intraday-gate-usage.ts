/**
 * Loads live `ProIntradayUsage` (lib/promotion/pro-intraday.ts) for one user
 * from Supabase, so `lib/trade/place-order.ts` has something real to hand
 * `canEnterNewIntradayPosition`. That function has existed since PR #140
 * with no caller — nothing tagged an order as intraday-sourced at all. This
 * is the missing signal: `orders.intraday_sourced`
 * (`supabase/migrations/0047_intraday_sourced_orders.sql`), set only by the
 * intraday alerts panel's "Trade this" action.
 *
 * "Today" throughout is the America/New_York trading day (`etDateKey`), not
 * the UTC day — the same boundary the rest of the scan/session code uses.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { etDateKey } from "@/lib/market/session";
import { STARTING_CASH } from "@/lib/brokers/simulator";
import type { ProIntradayUsage } from "@/lib/promotion/pro-intraday";

type Supabase = SupabaseClient;

/** Recent-history window wide enough to cover today's orders plus a consecutive-loss streak that started yesterday. */
const LOOKBACK_DAYS = 10;
const CONSECUTIVE_LOSS_SCAN_LIMIT = 20;

/**
 * Same order of magnitude as the live circuit breaker's `WARNING_48H_LOSS_PCT`
 * (`lib/risk/config.ts`), but deliberately a separate constant: that one is a
 * rolling 48h window for the account-wide breaker, this is same-trading-day
 * and scoped to intraday-sourced trades only. `canEnterNewIntradayPosition`
 * takes this as a caller-supplied threshold rather than a `ProIntradayPolicy`
 * field, so there is nowhere else for it to live.
 */
export const PRO_INTRADAY_DAILY_LOSS_LOCK_PCT = 2;

function lookbackIso(): string {
  return new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();
}

/**
 * Rough paper-account equity: cash + cost basis of open positions. Not a
 * live mark-to-market (that would require a quote per open symbol just to
 * evaluate an order gate), but adequate for turning today's realized loss
 * into a percentage — the daily-loss-lock gate only needs a rough sense of
 * what slice of the account today's intraday losses represent.
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

export async function loadProIntradayUsage(
  supabase: Supabase,
  userId: string,
): Promise<Omit<ProIntradayUsage, "setupsDisplayedToday">> {
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

  // Concurrent-position count: of the symbols that have an intraday-sourced
  // filled order, how many still have an open position. An approximation —
  // it can't distinguish "still open from that entry" from "closed and
  // reopened manually since" without a direct order->position link, which
  // the schema doesn't carry — but conservative in the direction that
  // matters: it only ever counts a symbol actually opened via an intraday
  // alert.
  const intradaySymbols = Array.from(
    new Set(orders.filter((o) => o.status === "filled").map((o) => o.symbol.toUpperCase())),
  );
  let concurrentOpen = 0;
  if (intradaySymbols.length > 0) {
    const { data: openRows } = await supabase
      .from("positions")
      .select("symbol")
      .eq("user_id", userId)
      .eq("mode", "paper")
      .eq("closed", false)
      .in("symbol", intradaySymbols);
    concurrentOpen = (openRows ?? []).length;
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

  const dailyLossPct = equity > 0 && realizedPnlTodayUsd < 0 ? (Math.abs(realizedPnlTodayUsd) / equity) * 100 : 0;

  return { entriesToday, concurrentOpen, consecutiveLosses, dailyLossPct };
}

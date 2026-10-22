/**
 * The trade style an open position's stop is managed in (`lib/trade/tradeStyle.ts`).
 *
 * The style that stood when the trade was filled, from the trader's saved
 * history (`settings.prefs.gannRules.tradeStyleHistory`, `styleAt`): Gann
 * chooses the method for the market at entry ("in fast markets", W006 Rule
 * 2), so switching the picker later never re-manages a trade already open.
 * Fast adds Gann's day trail (`readGannExit`, "day_low"). A trade automation
 * placed (its entry order carries `source_plan_id`) stays on Swing: the
 * portfolio manager trades Fast only once the replay has measured it. Any
 * failed read answers Swing, the default.
 *
 * Intraday (2026-10-22) comes from the trade itself, not the history: an
 * entry taken from an intraday alert (`orders.intraday_sourced`) is managed
 * on the session's bars (`lib/gann/intradayExit.ts`), and closes at the
 * session's end unless the trader held it overnight (`orders.hold_overnight`)
 * or it is crypto, which has no session.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { readGannRulePrefs } from "@/lib/trade/away-notice";
import { styleAt, type TradeStyleChange } from "@/lib/gann/traderPrefs";
import type { TradeStyle } from "@/lib/trade/tradeStyle";
import { isCryptoSymbol } from "@/lib/data/alpaca";

/** One read of the trader's style history per manage pass. */
export async function traderStyleHistory(supabase: SupabaseClient, userId: string): Promise<TradeStyleChange[]> {
  const prefs = await readGannRulePrefs(supabase, userId);
  return prefs?.tradeStyleHistory ?? [];
}

/**
 * The style one position is managed in. `filledAt` is the fill (ISO).
 * `orderKey` names the column the exit row's `entry_order_id` matches in
 * `orders`: `id` on paper, `broker_order_id` live.
 */
export interface PositionExitStyle {
  style: TradeStyle;
  /** Intraday only: close what is left at the session's end. */
  closeAtSessionEnd: boolean;
}

const SWING: PositionExitStyle = { style: "swing", closeAtSessionEnd: false };

export async function positionExitStyle(
  supabase: SupabaseClient,
  history: readonly TradeStyleChange[],
  filledAt: string,
  entryOrderId: string | null,
  orderKey: "id" | "broker_order_id",
  symbol: string,
): Promise<PositionExitStyle> {
  const fast = styleAt(history, filledAt) === "fast";
  if (!entryOrderId) return fast ? { style: "fast", closeAtSessionEnd: false } : SWING;
  try {
    const { data, error } = await supabase
      .from("orders")
      .select("source_plan_id, intraday_sourced, hold_overnight")
      .eq(orderKey, entryOrderId)
      .maybeSingle();
    if (error || !data) return fast && !error ? { style: "fast", closeAtSessionEnd: false } : SWING;
    const row = data as { source_plan_id?: string | null; intraday_sourced?: boolean | null; hold_overnight?: boolean | null };
    if (row.intraday_sourced) {
      return { style: "intraday", closeAtSessionEnd: !row.hold_overnight && !isCryptoSymbol(symbol) };
    }
    return fast && !row.source_plan_id ? { style: "fast", closeAtSessionEnd: false } : SWING;
  } catch {
    return SWING;
  }
}

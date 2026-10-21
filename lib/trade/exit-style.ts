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
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { readGannRulePrefs } from "@/lib/trade/away-notice";
import { styleAt, type TradeStyleChange } from "@/lib/gann/traderPrefs";
import type { TradeStyle } from "@/lib/trade/tradeStyle";

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
export async function positionTradeStyle(
  supabase: SupabaseClient,
  history: readonly TradeStyleChange[],
  filledAt: string,
  entryOrderId: string | null,
  orderKey: "id" | "broker_order_id",
): Promise<TradeStyle> {
  if (styleAt(history, filledAt) !== "fast") return "swing";
  if (!entryOrderId) return "fast";
  try {
    const { data, error } = await supabase.from("orders").select("source_plan_id").eq(orderKey, entryOrderId).maybeSingle();
    if (error) return "swing";
    return (data as { source_plan_id?: string | null } | null)?.source_plan_id ? "swing" : "fast";
  } catch {
    return "swing";
  }
}

/**
 * The reversal is covered at the re-buy (A-PYRAMID-07, lib/gann/rebuy.ts).
 *
 * A trailing stop reverses (Q15, lib/gann/reverse.ts) and, with the trend
 * still the stopped trade's way, is bought again on the reaction
 * (lib/lifecycle/fromRebuy.ts). The two never both act on one stop: Gann's
 * Robert buys again 12 points back from the top (230 to 218;
 * `rebuy.ts` reads that reaction at his price) (*Tunnel Thru the Air* p.198),
 * so a short opened at the stop is closed there, as the replay's
 * `walkGannExit` closes it (`coverAt`, exit reason "covered"). The exit
 * managers read the level here for an automated reversal and close it at the
 * market once price reaches it; the re-buy waits for that close
 * (lib/trade/place-order.ts) so it never nets against the short.
 *
 * A person's own reversal has no plan behind it and is left to its own exits,
 * as the note that offered it says.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { PIVOT_SIGNAL_PREFIX, isPivotSignal } from "@/lib/lifecycle/fromPivot";
import { REBUY_SIGNAL_PREFIX } from "@/lib/lifecycle/fromRebuy";

/**
 * The re-buy level an open reversal is covered at, or null when the position
 * is not an automated reversal or no re-buy was seeded for its stop. A failed
 * read is null: the reversal keeps its own stop and exits, as before.
 */
export async function readRebuyCover(
  supabase: SupabaseClient,
  userId: string,
  entryOrderId: string | null,
  by: "id" | "broker_order_id",
): Promise<number | null> {
  if (!entryOrderId) return null;
  try {
    const { data: order } = await supabase.from("orders").select("source_plan_id").eq(by, entryOrderId).maybeSingle();
    const sourcePlanId = (order?.source_plan_id as string | null) ?? null;
    if (!sourcePlanId) return null;
    const { data: source } = await supabase
      .from("trade_plans")
      .select("signal_id")
      .eq("user_id", userId)
      .eq("plan_id", sourcePlanId)
      .maybeSingle();
    const signalId = (source?.signal_id as string | null) ?? null;
    if (!isPivotSignal(signalId)) return null;
    const stoppedPlanId = signalId!.slice(PIVOT_SIGNAL_PREFIX.length);
    const { data: rebuys } = await supabase
      .from("trade_plans")
      .select("entry_trigger")
      .eq("user_id", userId)
      .eq("signal_id", `${REBUY_SIGNAL_PREFIX}${stoppedPlanId}`)
      .limit(1);
    const level = Number((rebuys as { entry_trigger: unknown }[] | null)?.[0]?.entry_trigger);
    return Number.isFinite(level) && level > 0 ? level : null;
  } catch (err) {
    console.error(`rebuy-cover: ${entryOrderId} — ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * Whether the reversal (on `side`) has reached the re-buy level: a short
 * reversal of a long once price trades down to it, a long reversal of a short
 * once price trades up to it.
 */
export function coverReached(side: "long" | "short", price: number, cover: number): boolean {
  if (!Number.isFinite(price)) return false;
  return side === "short" ? price <= cover : price >= cover;
}

export function coverNote(symbol: string, cover: number): string {
  return `${symbol}: price reached the re-buy at ${cover.toFixed(2)}, so the opposite trade opened at the stop is closed there, as the rules close it.`;
}

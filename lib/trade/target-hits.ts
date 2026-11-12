/**
 * Records on the entry order the moment a trade first reached its TP1, its MTP
 * (master take profit) or its stop: `orders.tp1_hit_at`, `mp_hit_at` and
 * `sl_hit_at` (migration 0018). `lib/trade/targets.ts` shows a recorded hit as
 * "hit" on the orders page; until 2026-11-12 no path wrote these columns, so a
 * TP1 the exit manager had already sold at never showed as hit.
 *
 * A level counts as hit when the best price since the fill first crosses it,
 * whether or not shares were sold there: under the live rule TP1 is the level
 * the card names, not a resting order (`lib/trade/protocol-exit.ts`). Each
 * column is written once, only while still empty, so a later pass never moves
 * the first time.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { ledgerWriter } from "@/lib/supabase/ledger";

export interface TargetHits {
  tp1: boolean;
  mp: boolean;
}

function through(side: "long" | "short", best: number | null, level: number | null): boolean {
  if (level == null || best == null || !Number.isFinite(level) || !Number.isFinite(best) || level <= 0) return false;
  return side === "long" ? best >= level : best <= level;
}

/**
 * Pure: which profit levels the best price crossed this pass, reading the best
 * before the pass (`before`, null when none was stored yet) and after it.
 * A level already through before the pass is not new.
 */
export function newTargetHits(
  side: "long" | "short",
  before: number | null,
  after: number | null,
  levels: { takeProfit1: number | null; masterProfit: number | null },
): TargetHits {
  return {
    tp1: through(side, after, levels.takeProfit1) && !through(side, before, levels.takeProfit1),
    mp: through(side, after, levels.masterProfit) && !through(side, before, levels.masterProfit),
  };
}

/**
 * Writes each hit to the entry order, once. `column` is how the plan names its
 * entry order: the paper row's `id`, or the broker's `broker_order_id`.
 * Best effort: a failed write is logged and never stops the exit pass.
 */
export async function recordTargetHits(
  supabase: SupabaseClient,
  userId: string,
  order: { column: "id" | "broker_order_id"; value: string | null },
  hits: { tp1?: boolean; mp?: boolean; sl?: boolean },
  at: Date = new Date(),
): Promise<void> {
  if (!order.value) return;
  const cols: string[] = [];
  if (hits.tp1) cols.push("tp1_hit_at");
  if (hits.mp) cols.push("mp_hit_at");
  if (hits.sl) cols.push("sl_hit_at");
  for (const col of cols) {
    try {
      const { error } = await ledgerWriter(supabase)
        .from("orders")
        .update({ [col]: at.toISOString() })
        .eq(order.column, order.value)
        .eq("user_id", userId)
        .is(col, null);
      if (error) console.error(`target-hits: ${col} for order ${order.value} not recorded — ${error.message}`);
    } catch (err) {
      console.error(`target-hits: ${col} for order ${order.value} not recorded — ${String(err)}`);
    }
  }
}

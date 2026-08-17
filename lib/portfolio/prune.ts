/**
 * Deletes closed-position data once it's aged out — nothing on the website
 * shows a position more than 24 hours after it closed, so keeping the row
 * only grows storage as more users trade. `trade_logs` is untouched: both
 * `positions.id` and `orders.id` are `on delete set null` there (see
 * supabase/migrations/0002_trade_logging.sql), so deleting the ledger row
 * disconnects the audit record from it instead of removing it — the trade's
 * analytics summary survives even though the raw ledger row doesn't.
 */

import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export const CLOSED_RETENTION_MS = 24 * 3600 * 1000;

export interface PruneOutcome {
  deleted: number;
  error: string | null;
}

/** Deletes `positions` rows that closed more than 24 hours ago. */
export async function pruneClosedPositions(
  supabase: Supabase,
  userId: string,
  now: Date = new Date(),
): Promise<PruneOutcome> {
  const cutoff = new Date(now.getTime() - CLOSED_RETENTION_MS).toISOString();
  const { error, count } = await supabase
    .from("positions")
    .delete({ count: "exact" })
    .eq("user_id", userId)
    .eq("closed", true)
    .lt("closed_at", cutoff);
  return { deleted: count ?? 0, error: error?.message ?? null };
}

/**
 * Deletes `orders` rows that are filled, no longer held, and haven't been
 * touched in over 24 hours — the same "is it still held" test the Closed
 * Positions section itself runs (see `lib/portfolio/sections.ts`), so an
 * order only qualifies once the section would already call it closed.
 * `updated_at` is the closest thing an order has to a "closed at" timestamp:
 * it's bumped whenever reconciliation confirms the fill, so an order the
 * broker hasn't touched in 24+ hours is stable, not mid-update.
 *
 * `heldSymbols` decides safety, not `positions`: a symbol still held (even
 * under a brand-new position) means its orders are never candidates,
 * regardless of age — this only ever deletes rows for a position that has
 * actually closed.
 */
export async function pruneClosedOrders(
  supabase: Supabase,
  userId: string,
  heldSymbols: ReadonlySet<string>,
  now: Date = new Date(),
): Promise<PruneOutcome & { staleIds: string[] }> {
  const cutoff = new Date(now.getTime() - CLOSED_RETENTION_MS).toISOString();
  const { data, error: selectError } = await supabase
    .from("orders")
    .select("id, symbol")
    .eq("user_id", userId)
    .eq("status", "filled")
    .lt("updated_at", cutoff);
  if (selectError) return { deleted: 0, error: selectError.message, staleIds: [] };

  const staleIds = (data ?? [])
    .filter((o) => !heldSymbols.has(String(o.symbol).toUpperCase()))
    .map((o) => o.id as string);
  if (staleIds.length === 0) return { deleted: 0, error: null, staleIds: [] };

  const { error: deleteError, count } = await supabase
    .from("orders")
    .delete({ count: "exact" })
    .in("id", staleIds);
  return { deleted: count ?? 0, error: deleteError?.message ?? null, staleIds };
}

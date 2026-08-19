/**
 * Deletes portfolio data once it's aged out — nothing on the website shows a
 * position or order more than 3 hours past the market close that followed its
 * ending, so keeping the row only grows storage as more users trade.
 * `trade_logs` is untouched: both `positions.id` and `orders.id` are
 * `on delete set null` there (see supabase/migrations/0002_trade_logging.sql),
 * so deleting the ledger row disconnects the audit record from it instead of
 * removing it — the trade's analytics summary survives even though the raw
 * ledger row doesn't.
 *
 * The retention window is anchored to the market close rather than a flat
 * duration: a position that closes at 15:55 and one that closes at 09:35 both
 * belong on the Portfolio tab for the rest of that trading day, not for a
 * fixed number of hours that has nothing to do with when the next session
 * starts. See `lib/market/session.ts` (`mostRecentClose`) for the close-time
 * calculation.
 */

import { mostRecentClose } from "@/lib/market/session";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export const RETENTION_GRACE_MS = 3 * 3600 * 1000;

export interface PruneOutcome {
  deleted: number;
  error: string | null;
}

/**
 * A row with an ending timestamp `<= cutoff` is eligible for deletion. The
 * cutoff is the most recent market close that is itself already at least
 * `RETENTION_GRACE_MS` in the past — equivalently, the most recent close at
 * or before `now - grace`. A row that ended today, before today's close,
 * only crosses the cutoff once `now` reaches today's close plus the grace
 * period; a row that ended after today's close (e.g. an after-hours
 * rejection) doesn't cross it until 3 hours past *tomorrow's* close.
 */
function retentionCutoff(now: Date): string {
  return mostRecentClose(new Date(now.getTime() - RETENTION_GRACE_MS)).toISOString();
}

/** Deletes `positions` rows that closed, and are now past the retention cutoff. */
export async function pruneClosedPositions(
  supabase: Supabase,
  userId: string,
  now: Date = new Date(),
): Promise<PruneOutcome> {
  const cutoff = retentionCutoff(now);
  const { error, count } = await supabase
    .from("positions")
    .delete({ count: "exact" })
    .eq("user_id", userId)
    .eq("closed", true)
    .lt("closed_at", cutoff);
  return { deleted: count ?? 0, error: error?.message ?? null };
}

/** Order statuses that ended without a position and are safe to prune once stale. */
const PRUNABLE_TERMINAL_STATUSES = [
  "rejected",
  "canceled",
  "cancelled", // Alpaca spells it with one L; accept both
  "expired",
  "replaced",
  "done_for_day",
] as const;

/**
 * Deletes `orders` rows that have reached a terminal state — filled and no
 * longer held (a closed position), or ended without ever filling (rejected,
 * canceled, expired, replaced, done for day) — and are now past the
 * retention cutoff. `updated_at` is the closest thing an order has to an
 * "ended at" timestamp: it's bumped whenever reconciliation confirms the fill
 * or the terminal status, so an order untouched since is stable, not
 * mid-update.
 *
 * `heldSymbols` decides safety for the filled branch only: a symbol still
 * held (even under a brand-new position) means its filled orders are never
 * candidates, regardless of age — this only ever deletes a filled order's row
 * once the position it opened has actually closed. Terminal-without-filling
 * statuses need no such check: they never held anything.
 */
export async function pruneClosedOrders(
  supabase: Supabase,
  userId: string,
  heldSymbols: ReadonlySet<string>,
  now: Date = new Date(),
): Promise<PruneOutcome & { staleIds: string[] }> {
  const cutoff = retentionCutoff(now);

  const [filledResult, terminalResult] = await Promise.all([
    supabase
      .from("orders")
      .select("id, symbol")
      .eq("user_id", userId)
      .eq("status", "filled")
      .lt("updated_at", cutoff),
    supabase
      .from("orders")
      .select("id")
      .eq("user_id", userId)
      .in("status", PRUNABLE_TERMINAL_STATUSES)
      .lt("updated_at", cutoff),
  ]);
  if (filledResult.error) return { deleted: 0, error: filledResult.error.message, staleIds: [] };
  if (terminalResult.error) return { deleted: 0, error: terminalResult.error.message, staleIds: [] };

  const staleFilledIds = (filledResult.data ?? [])
    .filter((o) => !heldSymbols.has(String(o.symbol).toUpperCase()))
    .map((o) => o.id as string);
  const staleTerminalIds = (terminalResult.data ?? []).map((o) => o.id as string);
  const staleIds = [...staleFilledIds, ...staleTerminalIds];
  if (staleIds.length === 0) return { deleted: 0, error: null, staleIds: [] };

  const { error: deleteError, count } = await supabase
    .from("orders")
    .delete({ count: "exact" })
    .in("id", staleIds);
  return { deleted: count ?? 0, error: deleteError?.message ?? null, staleIds };
}

/**
 * One pass of live-account sync: the three previously-unwired real-broker
 * modules (`lib/trade/exit-manager.ts`, `lib/portfolio/reconcile.ts`,
 * `lib/portfolio/trade-log-settle.ts`) all took `(supabase, creds, userId,
 * ...)` and had no caller — this is that caller. Mirrors what
 * `GET /api/orders`'s paper path already does every poll (advance exits,
 * reconcile what's open, settle what's pending), fetching the broker's
 * position list once and feeding it to all three rather than three separate
 * round trips.
 *
 * A no-op — not an error — when the user has no active live connection:
 * most accounts, since live order placement is new (see
 * `lib/trade/place-order.ts`).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getPositions } from "@/lib/brokers/alpaca";
import { readLiveAlpacaConnection } from "@/lib/brokers/live-creds";
import { manageProtocolExits, type ManageRun } from "@/lib/trade/exit-manager";
import { reconcilePositions, type LivePosition, type ReconcileOutcome } from "@/lib/portfolio/reconcile";
import { settlePendingTradeLogs, type SettlementRun } from "@/lib/portfolio/trade-log-settle";

export interface LiveSyncResult {
  connected: boolean;
  exits: ManageRun | null;
  reconcile: ReconcileOutcome | null;
  settlement: SettlementRun | null;
  /** Set when the broker's position list itself couldn't be read — nothing below ran. */
  error: string | null;
}

const NOT_CONNECTED: LiveSyncResult = { connected: false, exits: null, reconcile: null, settlement: null, error: null };

export async function syncLiveAccount(supabase: SupabaseClient, userId: string): Promise<LiveSyncResult> {
  const connection = await readLiveAlpacaConnection(supabase, userId);
  if (!connection) return NOT_CONNECTED;

  let positions: LivePosition[];
  let rawPositions: Awaited<ReturnType<typeof getPositions>>;
  try {
    rawPositions = await getPositions(connection.creds);
    positions = rawPositions.map((p) => ({
      symbol: p.symbol.toUpperCase(),
      qty: Math.abs(Number(p.qty)),
      side: (p.side === "short" ? "short" : "long") as "long" | "short",
      avgEntry: Number(p.avg_entry_price),
    }));
  } catch (err) {
    return {
      connected: true,
      exits: null,
      reconcile: null,
      settlement: null,
      error: `Couldn't read live positions from Alpaca — ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Exit management first: it can close a plan and write its trade log
  // (status 'pending', settled below) before reconciliation and settlement
  // run against the now-current state.
  const exits = await manageProtocolExits(supabase, connection.creds, userId, rawPositions).catch(
    (err): ManageRun => ({
      managed: 0,
      attached: 0,
      adjusted: 0,
      closed: 0,
      notes: [],
      error: err instanceof Error ? err.message : String(err),
    }),
  );

  const reconcile = await reconcilePositions(supabase, connection.creds, userId, positions).catch(
    (err): ReconcileOutcome => ({
      opened: 0,
      closed: 0,
      error: err instanceof Error ? err.message : String(err),
    }),
  );

  const settlement = await settlePendingTradeLogs(supabase, connection.creds, userId).catch(
    (err): SettlementRun => ({
      settled: 0,
      stillPending: 0,
      error: err instanceof Error ? err.message : String(err),
    }),
  );

  return { connected: true, exits, reconcile, settlement, error: null };
}

/**
 * One pass of live-account sync: the real-broker modules
 * (`lib/trade/exit-manager.ts`, `lib/portfolio/reconcile.ts`,
 * `lib/portfolio/trade-log-settle.ts`, `lib/portfolio/order-status.ts`) all
 * took `(supabase, creds, userId, ...)` and had no caller — this is that
 * caller. Mirrors what `GET /api/orders`'s paper path already does every
 * poll (advance exits, reconcile what's open, settle what's pending),
 * fetching the broker's position list once and feeding it to all four
 * rather than four separate round trips. `order-status.ts`'s
 * `syncLiveOrderStatuses` was added later than the other three (2026-09-23)
 * — it existed fully built, including the DB columns it writes, but had no
 * caller either; see its own header for why that went unnoticed.
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
import { syncLiveOrderStatuses, type OrderSyncRun } from "@/lib/portfolio/order-status";
import { evaluateLiveTradeLoss } from "@/lib/risk/live-trade-loss";

export interface LiveSyncResult {
  connected: boolean;
  exits: ManageRun | null;
  reconcile: ReconcileOutcome | null;
  settlement: SettlementRun | null;
  orderSync: OrderSyncRun | null;
  /** Set when the broker's position list itself couldn't be read — nothing below ran. */
  error: string | null;
}

const NOT_CONNECTED: LiveSyncResult = {
  connected: false,
  exits: null,
  reconcile: null,
  settlement: null,
  orderSync: null,
  error: null,
};

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
      orderSync: null,
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

  // Order-status sync: the Pending list's counterpart to `reconcile` above —
  // reconcile tracks whether a *position* opened or closed; this tracks
  // whether an individual *order* has since filled, been rejected, or been
  // cancelled at the broker. See lib/portfolio/order-status.ts's header.
  const orderSync = await syncLiveOrderStatuses(supabase, connection.creds, userId).catch(
    (err): OrderSyncRun => ({
      updated: 0,
      orphaned: 0,
      error: err instanceof Error ? err.message : String(err),
    }),
  );

  // Live-only per-trade loss cascade (lib/risk/live-trade-loss.ts) — after
  // reconciliation, so the local `positions` rows this reads reflect any
  // opens/closes reconciliation just recorded. Best-effort per position;
  // never blocks the sync result above.
  await evaluateLiveLossForOpenPositions(supabase, connection.creds, userId, rawPositions).catch(
    (err) => console.error(`syncLiveAccount: live-loss evaluation failed — ${String(err)}`),
  );

  return { connected: true, exits, reconcile, settlement, orderSync, error: null };
}

async function evaluateLiveLossForOpenPositions(
  supabase: SupabaseClient,
  creds: Parameters<typeof evaluateLiveTradeLoss>[1],
  userId: string,
  rawPositions: Awaited<ReturnType<typeof getPositions>>,
): Promise<void> {
  const { data: openRows } = await supabase
    .from("positions")
    .select("id, symbol")
    .eq("user_id", userId)
    .eq("mode", "live")
    .eq("closed", false);
  if (!openRows || openRows.length === 0) return;

  const bySymbol = new Map(rawPositions.map((p) => [p.symbol.toUpperCase(), p]));
  for (const row of openRows as { id: string; symbol: string }[]) {
    const live = bySymbol.get(row.symbol.toUpperCase());
    if (!live) continue;
    await evaluateLiveTradeLoss(supabase, creds, userId, { id: row.id, symbol: row.symbol }, live).catch(
      (err) => console.error(`evaluateLiveLossForOpenPositions: failed for ${row.symbol} — ${String(err)}`),
    );
  }
}

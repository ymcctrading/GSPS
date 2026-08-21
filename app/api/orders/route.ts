/**
 * GSPS — /api/orders
 * POST: place an order (paper by default; live requires a connected live broker).
 * GET:  list the user's orders (mirrored in Supabase).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  assetClassOf,
  evaluateRestingOrders,
  listOpenPositions,
  quotePrice,
} from "@/lib/brokers/simulator";
import { evaluateTargets } from "@/lib/trade/targets";
import { manageSimulatedExits } from "@/lib/trade/exit-manager-sim";
import { OrderSchema, placeSimulatedOrder } from "@/lib/trade/place-order";
import { pruneClosedOrders } from "@/lib/portfolio/prune";
import { parseOccSymbol } from "@/lib/portfolio/occ";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const parsed = OrderSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid order" }, { status: 400 });
  }

  // Everything that actually happens to the money lives in
  // lib/trade/place-order.ts, so Guided Decision Mode submits through the same
  // path this ticket does rather than through a copy of it.
  const placed = await placeSimulatedOrder(supabase, user.id, parsed.data);
  return NextResponse.json(placed.body, { status: placed.status });}


/**
 * List the user's orders, with resting simulated limit orders evaluated
 * against live prices and the staged protocol exits advanced.
 *
 * Paper trading has no external broker to reconcile against — this app's own
 * `orders`/`positions` tables are the only ledger there is (see
 * lib/brokers/simulator.ts), so what used to be a broker-sync pass is now
 * just "did any resting order cross its price" and "did any exit plan's
 * levels get touched", both evaluated directly against the live feed.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  // Fill whatever resting limit orders the market has now reached, before
  // reading the ledger back — otherwise the response is a snapshot taken one
  // moment before the rows in it became true. Also cancels entries the market
  // has invalidated (stop hit before the entry ever filled) — see
  // lib/trade/invalidate-pending.ts.
  const restingFill = await evaluateRestingOrders(supabase, user.id, user.email).catch(
    (err): { filled: number; invalidated: number; error: string | null } => ({
      filled: 0,
      invalidated: 0,
      error: err instanceof Error ? err.message : String(err),
    }),
  );
  if (restingFill.error) console.error(`orders: resting-order evaluation — ${restingFill.error}`);

  // Advancing the staged exits here is what makes the trailing stop and the
  // master-target reversal real: both depend on where price has *been*, so
  // they can only move forward when something samples the market. The
  // Portfolio page polls this endpoint, which is where the sampling happens.
  const exits = await manageSimulatedExits(supabase, user.id).catch(
    (err): { managed: number; filled: number; closed: number; notes: string[]; error: string | null } => ({
      managed: 0,
      filled: 0,
      closed: 0,
      notes: [],
      error: err instanceof Error ? err.message : String(err),
    }),
  );
  if (exits.error) console.error(`orders: exit management — ${exits.error}`);

  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let orders = (data ?? []) as Record<string, unknown>[];

  // A closed order — filled, no longer held, untouched for 24+ hours — has
  // nothing left to show, so it's deleted rather than kept growing the ledger.
  const heldSymbols = new Set((await listOpenPositions(supabase, user.id)).map((p) => p.symbol.toUpperCase()));
  const prune = await pruneClosedOrders(supabase, user.id, heldSymbols).catch(
    (err): { deleted: number; error: string | null; staleIds: string[] } => ({
      deleted: 0,
      error: err instanceof Error ? err.message : String(err),
      staleIds: [],
    }),
  );
  if (prune.error) {
    console.error(`orders: closed-order prune — ${prune.error}`);
  } else if (prune.staleIds.length > 0) {
    const pruned = new Set(prune.staleIds);
    orders = orders.filter((o) => !pruned.has(String(o.id)));
  }

  // One quote per unique equity/crypto symbol on the page — bounded to what's
  // actually shown, not a market-wide call. Options have no live per-contract
  // feed (see lib/brokers/simulator.ts), so they carry no live mark here.
  const symbols = [...new Set(orders.map((o) => String(o.symbol).toUpperCase()))].filter((s) => !parseOccSymbol(s));
  const quoteEntries = await Promise.all(
    symbols.map(async (s) => [s, await quotePrice(s, assetClassOf(s))] as const),
  );
  const quotes = new Map(quoteEntries);

  const enriched = orders.map((o) => {
    const currentPrice = quotes.get(String(o.symbol).toUpperCase()) ?? null;
    const side = o.side === "sell" ? "sell" : "buy";
    const levels = {
      tp1: numOrNull(o.take_profit),
      mp: numOrNull(o.master_profit),
      sl: numOrNull(o.stop_price),
    };
    return {
      ...o,
      currentPrice,
      // Not modeled: an accurate day P/L needs the symbol's previous session
      // close, which isn't fetched here.
      dayPl: null,
      dayPlPct: null,
      targets: evaluateTargets(side, levels, currentPrice, {
        tp1At: o.tp1_hit_at as string | null,
        mpAt: o.mp_hit_at as string | null,
        slAt: o.sl_hit_at as string | null,
      }),
    };
  });

  return NextResponse.json({
    orders: enriched,
    sync: {
      syncedAt: new Date().toISOString(),
      syncError: restingFill.error,
      reconciled: restingFill.filled,
      invalidated: restingFill.invalidated,
      orphaned: 0,
      source: "simulated-paper",
    },
    // What the staged exits did on this pass. Reported rather than silent: a
    // stop that moved is a change to the user's risk, and one that couldn't
    // be moved is something they need to know about while they can still act.
    exits: {
      managed: exits.managed,
      attached: exits.filled,
      adjusted: 0,
      closed: exits.closed,
      notes: exits.notes,
      error: exits.error,
    },
  });
}

function numOrNull(v: unknown): number | null {
  const n = Number(v);
  return v == null || Number.isNaN(n) ? null : n;
}


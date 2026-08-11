/**
 * GSPS — /api/positions/close
 * POST: liquidate an open position at market (whole position, or a partial
 * quantity). Backs the "Close position" action in the portfolio's open-positions
 * grid.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { closePosition, envCreds } from "@/lib/brokers/alpaca";
import { isCryptoSymbol } from "@/lib/data/alpaca";
import {
  brokerStatusFrom,
  numericOrUndefined,
  recordOrderExecution,
} from "@/lib/learning/record";
import { buildTradeLogRow, isFullClose, type ClosablePosition } from "@/lib/portfolio/trade-log";

/**
 * Which way the closing order went. Alpaca reports it on the order it created;
 * absent that, a close is a sale far more often than not, and guessing wrong on
 * a field the model reads is worse than the small bias of the default.
 */
function closingSide(order: { side?: unknown } | null | undefined): "buy" | "sell" {
  return order?.side === "buy" ? "buy" : "sell";
}

/** Quantity actually sent to the broker, falling back to what was requested. */
function closedQty(
  order: { qty?: unknown } | null | undefined,
  requested: number | undefined,
): number {
  return numericOrUndefined(order?.qty) ?? requested ?? 0;
}

const CloseSchema = z.object({
  symbol: z.string().min(1).max(24),
  /** Omit to close the entire position. */
  qty: z.number().positive().max(100000).optional(),
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const parsed = CloseSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }
  const { symbol, qty } = parsed.data;

  const creds = envCreds("paper");
  if (!creds) {
    return NextResponse.json(
      { error: "Paper trading is not configured (missing Alpaca API keys)." },
      { status: 503 },
    );
  }

  // Read the open position before closing it: once the row is marked closed the
  // entry price and open time are still there, but the trade log has to be built
  // from the position that existed, not from whatever a later query returns.
  const { data: openPosition } = await supabase
    .from("positions")
    .select("id, symbol, asset_class, qty, avg_entry_price, opened_at")
    .eq("user_id", user.id)
    .eq("symbol", symbol.toUpperCase())
    .eq("closed", false)
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const fullClose = isFullClose(openPosition ? Number(openPosition.qty) : Infinity, qty);

  const startedAt = Date.now();
  try {
    const order = await closePosition(creds, symbol.toUpperCase(), qty);

    // The audit trail `trade_logs` was built for, and — as of the fix this
    // comment replaces — the reconciliation that keeps it from going
    // permanently 'pending'.
    //
    // A full close is deliberately NOT recorded here, and `positions.closed`
    // is deliberately NOT set here either. `reconcilePositions`
    // (lib/portfolio/reconcile.ts, called from GET /api/portfolio on every
    // 10-second poll) notices this position has disappeared from the live
    // broker book, pulls the actual filled closing order, and writes a
    // trade_logs row with the real exit price, P/L and exit_condition
    // (tp1 / stop_loss / manual) — richer than anything available the instant
    // this route returns, since a market order's fill is not always in the
    // response body yet. Writing a row here too would either race it into a
    // duplicate, or — if this also marked `closed: true` — hide the position
    // from that reconciliation forever, which is exactly why every trade_logs
    // row from this route used to stay 'pending' indefinitely.
    //
    // A partial close is the one case reconcilePositions structurally cannot
    // see: the position never disappears from the broker's book, it only
    // shrinks, so nothing else will ever record this exit. It is logged here,
    // and the position is left open (not marked `closed: true` — shares
    // remain, and doing so would make reconcilePositions treat the next poll's
    // still-live, reduced-qty position as a brand-new one).
    if (!fullClose && openPosition) {
      const row = buildTradeLogRow({
        userId: user.id,
        position: openPosition as unknown as ClosablePosition,
        closedQty: closedQty(order, qty),
        exitPrice: numericOrUndefined(order?.filled_avg_price),
      });
      const { error: logError } = await supabase.from("trade_logs").insert(row);
      if (logError) {
        console.error(`positions/close: trade log for ${row.symbol} not written — ${logError.message}`);
      }
    }

    // The exit is the half of the trade that carries the outcome. Without it the
    // learning tables would hold entries with nothing to score them against.
    // Recorded for both full and partial closes — this is the order-submission
    // event, independent of who ends up owning the trade_logs row.
    await recordOrderExecution(user.id, {
      symbol: symbol.toUpperCase(),
      assetClass: isCryptoSymbol(symbol) ? "crypto" : "us_equity",
      orderType: "market",
      side: closingSide(order),
      quantity: closedQty(order, qty),
      filledPrice: numericOrUndefined(order?.filled_avg_price),
      filledQty: numericOrUndefined(order?.filled_qty),
      brokerStatus: brokerStatusFrom(order?.status),
      latencyMs: Date.now() - startedAt,
    });

    return NextResponse.json({ ok: true, order, fullClose });
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    // Alpaca 404s when the position is already flat — that's the desired state,
    // not a failure the user needs to act on.
    if (raw.includes("(404)")) {
      return NextResponse.json({ ok: true, alreadyFlat: true });
    }
    return NextResponse.json({ error: raw }, { status: 502 });
  }
}

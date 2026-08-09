/**
 * GSPS — /api/positions/close
 * POST: liquidate an open position at market (whole position, or a partial
 * quantity). Backs the "Close position" action in the portfolio's open-positions
 * grid, and is rule 3's manual escape hatch out of a staged protocol exit.
 *
 * A close is the end of a trade, so it writes the trade log. The exit half of
 * that row is left empty on purpose: at this point the liquidation has been
 * *accepted*, not filled, and the price it will fill at does not exist yet.
 * `settlePendingTradeLogs` completes the row from the broker's own fills — see
 * `lib/portfolio/trade-log-settle.ts`. Nothing here writes a price no execution
 * produced.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  closePosition,
  envCreds,
  getPositions,
  type AlpacaCreds,
  type AlpacaPosition,
} from "@/lib/brokers/alpaca";
import { closePlanForSymbol, type PlanRow } from "@/lib/trade/exit-manager";
import { describeProtocolSignal, recordPendingExit } from "@/lib/portfolio/trade-log-record";

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
  const ticker = symbol.toUpperCase();

  const creds = envCreds("paper");
  if (!creds) {
    return NextResponse.json(
      { error: "Paper trading is not configured (missing Alpaca API keys)." },
      { status: 503 },
    );
  }

  // Read the position *before* liquidating it. Afterwards the entry price and
  // quantity are gone from the broker, and they are exactly what the trade log
  // needs — the alternative is a log row that knows how a trade ended but not
  // how it started.
  const held = await heldPosition(creds, ticker);

  try {
    const order = await closePosition(creds, ticker, qty);

    // Mark the local ledger closed so the portfolio reflects the exit even
    // before the broker's fill lands. A failure here doesn't undo the exit.
    await supabase
      .from("positions")
      .update({ closed: true, closed_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("symbol", ticker)
      .eq("closed", false);

    // Closing by hand ends any staged protocol exit on this symbol. Without
    // this the manager would keep re-arming stops against a position that no
    // longer exists, and would log the same trade a second time.
    const plan = await closePlanForSymbol(supabase, user.id, ticker);

    const logged = await logClose(supabase, user.id, ticker, held, plan, qty);

    return NextResponse.json({ ok: true, order, tradeLogged: logged });
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    // Alpaca 404s when the position is already flat — that's the desired state,
    // not a failure the user needs to act on. Nothing is logged: no position
    // means no trade ended here.
    if (raw.includes("(404)")) {
      await closePlanForSymbol(supabase, user.id, ticker);
      return NextResponse.json({ ok: true, alreadyFlat: true });
    }
    return NextResponse.json({ error: raw }, { status: 502 });
  }
}

async function heldPosition(creds: AlpacaCreds, ticker: string): Promise<AlpacaPosition | null> {
  try {
    const positions = await getPositions(creds);
    return positions.find((p) => p.symbol.toUpperCase() === ticker) ?? null;
  } catch {
    // The close still goes ahead — an unreadable position list is a reason to
    // log less, not a reason to leave the user in a trade they asked to exit.
    return null;
  }
}

/**
 * Write the trade log for what was just closed.
 *
 * Returns false when there was nothing to log: no position was readable, so
 * every field of the row would have been a guess. The close itself still
 * succeeded, and the caller reports that honestly rather than claiming an audit
 * trail it doesn't have.
 */
async function logClose(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  ticker: string,
  held: AlpacaPosition | null,
  plan: PlanRow | null,
  requestedQty: number | undefined,
): Promise<boolean> {
  if (!held) return false;

  const heldQty = Math.abs(Number(held.qty));
  const closedQty = requestedQty != null ? Math.min(requestedQty, heldQty) : heldQty;
  if (!Number.isFinite(closedQty) || closedQty <= 0) return false;

  const entryPrice = Number(held.avg_entry_price);
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) return false;

  const id = await recordPendingExit(supabase, userId, {
    symbol: ticker,
    direction: held.side === "short" ? "sell" : "buy",
    quantity: closedQty,
    entryPrice,
    // The plan's creation time is the closest thing to a real entry timestamp
    // we hold; settlement measures the closing fills from it. Without a plan
    // the trade started outside anything this app recorded, so the close time
    // is the earliest instant we can honestly claim.
    entryTimestamp: plan?.created_at ?? new Date().toISOString(),
    signalCalled: plan
      ? describeProtocolSignal({
          stopLoss: plan.stop_loss,
          takeProfit1: plan.take_profit_1,
          masterProfit: plan.master_profit,
        })
      : "Manual close (no protocol plan on record)",
  });

  return id != null;
}

/**
 * GSPS — /api/positions/close
 * POST: liquidate an open position at market (whole position, or a partial
 * quantity). Backs the "Close position" action in the portfolio's open-positions
 * grid, and is rule 3's manual escape hatch out of a staged protocol exit.
 *
 * A close that flattens the position is the end of a trade, so it writes the
 * trade log. The exit half of that row is left empty on purpose: at this point
 * the liquidation has been *accepted*, not filled, and the price it will fill
 * at does not exist yet. `settlePendingTradeLogs` completes the row from the
 * broker's own fills — see `lib/portfolio/trade-log-settle.ts`. Nothing here
 * writes a price no execution produced.
 *
 * A close that leaves shares open (a partial `qty`, less than what's held) is
 * not the end of anything a protocol plan is running. Retiring the plan here
 * would abandon the trailing-stop management on whatever remains, and logging
 * only the closed slice would give settlement a row whose declared quantity
 * doesn't match the trade it's trying to describe — see `logClose` below.
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

/** Float slop for "the requested qty is effectively the whole position." */
const QTY_EPSILON = 1e-6;

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
  const heldQty = held ? Math.abs(Number(held.qty)) : null;
  // Undefined `qty` always means "close everything." A `qty` that covers (or
  // very nearly covers) what's held is the same thing by another route — the
  // distinction that matters is whether shares remain afterward, not which
  // request shape asked for it.
  const fullClose = qty == null || heldQty == null || qty >= heldQty - QTY_EPSILON;

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

    if (!fullClose) {
      // Genuine partial close against a plan that's still running. The trade
      // isn't over — the plan keeps managing the trailing stop on what's left
      // — so nothing is retired and nothing is logged here. (The plan's own
      // tranche bookkeeping is now stale relative to what's actually held,
      // since these shares left outside its own tranche orders; reconciling
      // that — resizing or cancelling the affected resting order — is not
      // done automatically. `manageProtocolExits` will still move the stop
      // for whatever the broker reports as held.)
      return NextResponse.json({ ok: true, order, tradeLogged: false, planRetired: false });
    }

    // Closing by hand ends any staged protocol exit on this symbol. Without
    // this the manager would keep re-arming stops against a position that no
    // longer exists, and would log the same trade a second time.
    const plan = await closePlanForSymbol(supabase, user.id, ticker);

    const logged = await logClose(supabase, user.id, ticker, held, plan);

    return NextResponse.json({ ok: true, order, tradeLogged: logged, planRetired: plan != null });
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
 * Write the trade log for a trade that has just fully closed.
 *
 * The logged quantity is the plan's *original* size, not what this particular
 * call closed. A staged exit can reach this point after TP1 already took part
 * of the position out at the broker, and settlement (`settleTradeLog`) matches
 * a row's fills chronologically from its entry timestamp, consuming the
 * *oldest* fills first up to the logged quantity. A row that under-declares
 * its quantity — the remainder this call closed, rather than the whole trade —
 * would be satisfied by the earlier TP1 fill alone and never reach the fill
 * this call actually produced, reporting TP1's price, timestamp and P/L sign
 * for what was really a different exit. Logging the full original quantity
 * means settlement has to walk every fill the trade produced, landing on the
 * correct blended price across all of them.
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
): Promise<boolean> {
  if (!held) return false;

  const quantity = plan ? plan.qty : Math.abs(Number(held.qty));
  if (!Number.isFinite(quantity) || quantity <= 0) return false;

  const entryPrice = Number(held.avg_entry_price);
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) return false;

  const result = await recordPendingExit(supabase, userId, {
    symbol: ticker,
    direction: held.side === "short" ? "sell" : "buy",
    quantity,
    entryPrice,
    // The plan's creation time is the closest thing to a real entry timestamp
    // we hold; settlement measures the closing fills from it. Without a plan
    // the trade started outside anything this app recorded, so the close time
    // is the earliest instant we can honestly claim.
    entryTimestamp: plan?.created_at ?? new Date().toISOString(),
    exitPlanId: plan?.id ?? null,
    signalCalled: plan
      ? describeProtocolSignal({
          stopLoss: plan.stop_loss,
          takeProfit1: plan.take_profit_1,
          masterProfit: plan.master_profit,
        })
      : "Manual close (no protocol plan on record)",
  });

  // `duplicate` means a concurrent pass (a poll's own `finish`, landing at
  // nearly the same moment) already logged this plan — the trade is recorded,
  // just not by this call. Only `failed` means nothing is on record anywhere.
  return result.status !== "failed";
}

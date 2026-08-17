/**
 * GSPS — /api/positions/close
 * POST: liquidate an open position at market (whole position, or a partial
 * quantity). Backs the "Close position" action in the portfolio's open-positions
 * grid, and is rule 3's manual escape hatch out of a staged protocol exit.
 *
 * Paper trading is simulated (see lib/brokers/simulator.ts), so the fill and
 * its price are known synchronously — there is no broker to wait on, and this
 * route writes the trade log itself instead of leaving it pending for
 * settlement. Two lifecycles still meet here, same as before:
 *
 *   - **Protocol-managed** (a working `protocol_exits` plan for the symbol):
 *     `closeSimPlanForSymbol` retires the plan and writes its own blended
 *     trade log across whatever tranches already filled plus this close.
 *   - **Plain** (no plan ever existed for the symbol): this route writes the
 *     trade log itself, directly, using the fill this call just produced.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { closePositionSim, getOpenPosition } from "@/lib/brokers/simulator";
import { isCryptoSymbol } from "@/lib/data/alpaca";
import { brokerStatusFrom, recordOrderExecution } from "@/lib/learning/record";
import { buildTradeLogRow } from "@/lib/portfolio/trade-log";
import { closeSimPlanForSymbol } from "@/lib/trade/exit-manager-sim";
import { killSwitchRefusal } from "@/lib/trade/kill-switch";

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

  // Refuse before anything is written or priced. The simulator fills
  // synchronously, so there is no "accepted but not yet executed" state to
  // unwind — a halt has to happen ahead of the fill, not around it.
  const halted = killSwitchRefusal();
  if (halted) return NextResponse.json(halted, { status: 503 });

  const parsed = CloseSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }
  const { symbol, qty } = parsed.data;
  const ticker = symbol.toUpperCase();

  const startedAt = Date.now();
  try {
    const before = await getOpenPosition(supabase, user.id, ticker);
    if (!before) {
      return NextResponse.json({ ok: true, alreadyFlat: true });
    }

    const fill = await closePositionSim(supabase, user.id, ticker, qty);
    if (!fill) {
      return NextResponse.json({ ok: true, alreadyFlat: true });
    }

    const fullClose = qty == null || qty >= before.qty - 1e-6;

    // Which lifecycle owns this trade. `closeSimPlanForSymbol` finds the most
    // recent working plan for the symbol, attributes whatever tranches never
    // got the chance to fill to this close, and writes its own blended trade
    // log — a symbol with a working plan must never also get the plain
    // trade-log write below, or the trade would be logged twice.
    const plan = fullClose ? await closeSimPlanForSymbol(supabase, user.id, ticker, fill.price) : null;

    let tradeLogged = plan != null;
    if (!plan) {
      const row = buildTradeLogRow({
        userId: user.id,
        position: {
          id: before.id,
          symbol: before.symbol,
          asset_class: before.asset_class,
          qty: before.qty,
          avg_entry_price: before.avg_entry_price,
          opened_at: before.opened_at,
          side: before.side === "short" ? "sell" : "buy",
        },
        closedQty: fill.qty,
        exitPrice: fill.price,
      });
      const { error: logError } = await supabase.from("trade_logs").insert(row);
      if (logError) {
        console.error(`positions/close: trade log for ${row.symbol} not written — ${logError.message}`);
      } else {
        tradeLogged = true;
      }
    }

    await recordOrderExecution(user.id, {
      symbol: ticker,
      assetClass: isCryptoSymbol(symbol) ? "crypto" : "us_equity",
      orderType: "market",
      side: before.side === "long" ? "sell" : "buy",
      quantity: fill.qty,
      filledPrice: fill.price,
      filledQty: fill.qty,
      brokerStatus: brokerStatusFrom("filled"),
      latencyMs: Date.now() - startedAt,
    });

    return NextResponse.json({
      ok: true,
      order: { symbol: ticker, side: before.side === "long" ? "sell" : "buy", qty: fill.qty, filled_avg_price: fill.price, status: "filled" },
      fullClose,
      tradeLogged,
      planRetired: plan != null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}

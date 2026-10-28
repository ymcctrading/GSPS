/**
 * Closing a paper position at market, shared by `/api/positions/close` (one
 * position) and `/api/positions/close-all` (Gann's twice-a-year close-out and
 * rest, M-K4; owner's Q16, "Button"). The simulator fills synchronously, so
 * the fill and its trade log are written here.
 *
 * Two lifecycles meet: a protocol-managed position (a working `protocol_exits`
 * plan) is retired by `closeSimPlanForSymbol`, which writes its own blended
 * trade log; a plain position gets its trade log written directly, never both,
 * or the trade would be logged twice.
 *
 * No kill-switch check, deliberately: this only ever reduces or flattens an
 * existing position, and protective actions stay available (see
 * lib/trade/kill-switch.ts).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { closePositionSim, getOpenPosition, hasWorkingPlan, listOpenPositions } from "@/lib/brokers/simulator";
import { isCryptoSymbol } from "@/lib/data/alpaca";
import { brokerStatusFrom, recordOrderExecution } from "@/lib/learning/record";
import { buildTradeLogRow } from "@/lib/portfolio/trade-log";
import { insertTradeLog } from "@/lib/portfolio/trade-log-insert";
import { closeSimPlanForSymbol } from "@/lib/trade/exit-manager-sim";

export interface ClosedPosition {
  ok: true;
  alreadyFlat?: boolean;
  order?: { symbol: string; side: "buy" | "sell"; qty: number; filled_avg_price: number; status: "filled" };
  fullClose?: boolean;
  tradeLogged?: boolean;
  planRetired?: boolean;
}

/** A close refused before anything was sold. */
export interface CloseRefused {
  ok: false;
  error: string;
  code: "managed_partial_close";
}

/**
 * Close `qty` of a paper position (all of it when omitted) at market. A part
 * of a position with a working managed exit is refused: the plan exits the
 * whole position (Q14), and selling a part would leave it working on shares
 * no longer held.
 */
export async function closePaperPosition(
  supabase: SupabaseClient,
  userId: string,
  symbol: string,
  qty?: number,
): Promise<ClosedPosition | CloseRefused> {
  const ticker = symbol.toUpperCase();
  const startedAt = Date.now();
  const before = await getOpenPosition(supabase, userId, ticker);
  if (!before) return { ok: true, alreadyFlat: true };
  if (qty != null && qty < before.qty - 1e-6 && (await hasWorkingPlan(supabase, userId, ticker)) !== false) {
    return {
      ok: false,
      error: `Your ${ticker} position runs on a managed exit, which exits the whole position, so part of it can't be sold on its own. Close all of it, or edit its exit levels. Nothing was sold.`,
      code: "managed_partial_close",
    };
  }

  const fill = await closePositionSim(supabase, userId, ticker, qty);
  if (!fill) return { ok: true, alreadyFlat: true };

  const fullClose = qty == null || qty >= before.qty - 1e-6;

  // A full close retires a working protocol plan, which logs the trade
  // across whatever tranches already filled plus this close.
  const plan = fullClose ? await closeSimPlanForSymbol(supabase, userId, ticker, fill.price) : null;

  let tradeLogged = plan != null;
  if (!plan) {
    const row = buildTradeLogRow({
      userId,
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
    const { error: logError } = await insertTradeLog(supabase, "paper", { ...row });
    if (logError) {
      console.error(`positions/close: trade log for ${row.symbol} not written — ${logError.message}`);
    } else {
      tradeLogged = true;
    }
  }

  await recordOrderExecution(userId, {
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

  return {
    ok: true,
    order: { symbol: ticker, side: before.side === "long" ? "sell" : "buy", qty: fill.qty, filled_avg_price: fill.price, status: "filled" },
    fullClose,
    tradeLogged,
    planRetired: plan != null,
  };
}

export interface CloseAllResult {
  closed: string[];
  failed: { symbol: string; error: string }[];
}

/** Close every open paper position at market, one after another. One failure doesn't stop the rest. */
export async function closeAllPaperPositions(supabase: SupabaseClient, userId: string): Promise<CloseAllResult> {
  const out: CloseAllResult = { closed: [], failed: [] };
  for (const p of await listOpenPositions(supabase, userId)) {
    try {
      const r = await closePaperPosition(supabase, userId, p.symbol);
      if (r.ok && !r.alreadyFlat) out.closed.push(p.symbol.toUpperCase());
    } catch (err) {
      out.failed.push({ symbol: p.symbol.toUpperCase(), error: err instanceof Error ? err.message : String(err) });
    }
  }
  return out;
}

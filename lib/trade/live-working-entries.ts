/**
 * The live account's resting entry orders, read from the broker, so Gann's
 * capital rules read the whole book a new live order joins (review fix 2,
 * 2026-10-21, left open for live: "Live working orders are not counted yet").
 *
 * Gann's five stocks (rule 8) and 30 points of capital a share
 * (lib/risk/gannCapital.ts) are rules about what the account holds once its
 * orders fill: two resting live limits placed one after the other must not
 * each pass alone and together open a sixth stock, as on paper
 * (`listWorkingPaperEntries`). An order that only reduces a position held now
 * is protective and left out, and bracket legs are nested under their entry
 * (`getOpenOrdersNested`), so a resting entry's stop is never read as a short.
 *
 * A resting order with no limit or stop price (a market order queued outside
 * the session) is priced at `priceOf`, the caller's live quote; null when
 * that can't be read, so the caller fails closed.
 *
 * Three-question basis: (1) Gann, rule 8 and *Commodities* rule 1 on capital,
 * as gannCapital.ts. (2) No periodicity claim. (3) Correspondence: the live
 * account reads its book as the paper one does.
 */

import type { AlpacaOrder, AlpacaPosition } from "@/lib/brokers/alpaca";
import { parseOccSymbol } from "@/lib/portfolio/occ";
import { isProtectiveOrder } from "@/lib/trade/kill-switch";

export interface WorkingLiveEntry {
  symbol: string;
  side: "buy" | "sell";
  qty: number;
  price: number;
}

export async function workingLiveEntries(
  orders: AlpacaOrder[],
  positions: AlpacaPosition[],
  priceOf: (symbol: string) => Promise<number | null>,
): Promise<WorkingLiveEntry[] | null> {
  const out: WorkingLiveEntry[] = [];
  for (const o of orders) {
    // Alpaca lists a crypto order as BTC/USD and its position as BTCUSD.
    const symbol = String(o.symbol ?? "").toUpperCase().replace("/", "");
    if (!symbol) continue;
    // Options are not shares; the capital rules read shares (as on paper).
    if (o.asset_class === "us_option" || parseOccSymbol(symbol) !== null) continue;
    const qty = Number(o.qty) - (Number(o.filled_qty) || 0);
    if (!(qty > 0)) continue;
    const side = o.side === "sell" ? "sell" : "buy";
    const held = positions.find((p) => p.symbol.toUpperCase().replace("/", "") === symbol);
    // A protective order larger than the position it guards (a partial close
    // made at the broker without resizing the stop) is read as an entry for
    // the excess, so it errs toward refusing the new order.
    const heldSide = held ? (Number(held.qty) < 0 || held.side === "short" ? "short" : "long") : null;
    if (isProtectiveOrder(heldSide, side, qty, held ? Math.abs(Number(held.qty)) : 0)) continue;
    let price = Number(o.limit_price ?? o.stop_price);
    if (!(price > 0)) {
      const quoted = await priceOf(symbol);
      if (quoted == null || !(quoted > 0)) return null;
      price = quoted;
    }
    out.push({ symbol, side, qty, price });
  }
  return out;
}

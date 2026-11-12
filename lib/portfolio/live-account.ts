/**
 * The member's own live Alpaca account, as the Portfolio page's Live view
 * shows it: the account's figures, its positions and its working orders,
 * read straight from the broker (owner, 2026-11-12: "Provide a way to toggle
 * between paper and live trading accounts").
 *
 * Pure: every broker read is passed in, so the shape is tested without one.
 * Strings from the broker become numbers here; one that doesn't parse is
 * null, never 0, so an unreadable figure is never shown as a real one.
 */

import type { AlpacaAccount, AlpacaOrder, AlpacaPosition } from "@/lib/brokers/alpaca";

export interface LiveAccountFigures {
  equity: number | null;
  cash: number | null;
  buyingPower: number | null;
  /** Today's change in equity, in dollars and as a fraction of yesterday's close. */
  dayPl: number | null;
  dayPlPct: number | null;
  /** Day trades used in the last five sessions (the broker's own count). */
  dayTradeCount: number | null;
}

export interface LivePositionRow {
  symbol: string;
  side: "long" | "short";
  qty: number | null;
  avgEntryPrice: number | null;
  currentPrice: number | null;
  marketValue: number | null;
  unrealizedPl: number | null;
  unrealizedPlPct: number | null;
  /** The resting protective stop for this symbol, when one is working. */
  stopPrice: number | null;
  /** True when the resting stop covers fewer shares than are held. */
  stopPartial: boolean;
}

export interface LiveOrderRow {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  type: string;
  qty: number | null;
  limitPrice: number | null;
  stopPrice: number | null;
  status: string;
  submittedAt: string | null;
}

export interface LiveAccountSnapshot {
  connected: true;
  account: LiveAccountFigures;
  positions: LivePositionRow[];
  orders: LiveOrderRow[];
}

const n = (v: unknown): number | null => {
  // Number("") is 0, so a blank string is unknown, not zero.
  const x = typeof v === "string" ? (v.trim() === "" ? NaN : Number(v)) : typeof v === "number" ? v : NaN;
  return Number.isFinite(x) ? x : null;
};

export function summarizeLiveAccount(
  account: AlpacaAccount,
  positions: AlpacaPosition[],
  openOrders: AlpacaOrder[],
): LiveAccountSnapshot {
  const equity = n(account.equity);
  const last = n(account.last_equity);
  const dayPl = equity != null && last != null ? equity - last : null;
  const orders: LiveOrderRow[] = openOrders.map((o) => ({
    id: o.id,
    symbol: o.symbol,
    side: o.side,
    type: o.type,
    qty: n(o.qty),
    limitPrice: n(o.limit_price),
    stopPrice: n(o.stop_price),
    status: o.status,
    submittedAt: o.submitted_at ?? o.created_at ?? null,
  }));
  return {
    connected: true,
    account: {
      equity,
      cash: n(account.cash),
      buyingPower: n(account.buying_power),
      dayPl,
      dayPlPct: dayPl != null && last != null && last > 0 ? dayPl / last : null,
      dayTradeCount: n(account.daytrade_count),
    },
    positions: positions.map((p) => {
      const side = p.side === "short" ? "short" : "long";
      const exitSide = side === "long" ? "sell" : "buy";
      const stop = orders.find((o) => o.symbol === p.symbol && o.side === exitSide && o.stopPrice != null);
      return {
        symbol: p.symbol,
        side,
        qty: n(p.qty) == null ? null : Math.abs(n(p.qty) as number),
        avgEntryPrice: n(p.avg_entry_price),
        currentPrice: n(p.current_price),
        marketValue: n(p.market_value),
        unrealizedPl: n(p.unrealized_pl),
        unrealizedPlPct: n(p.unrealized_plpc),
        stopPrice: stop?.stopPrice ?? null,
        stopPartial: stop != null && stop.qty != null && n(p.qty) != null && stop.qty < Math.abs(n(p.qty) as number),
      };
    }),
    orders,
  };
}

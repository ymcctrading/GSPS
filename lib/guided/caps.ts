/**
 * Guided Decision Mode — what Gann's capital rules leave room for.
 *
 * Since 2026-10-16 (owner, "Switch all nine", Q12) Guided's own caps (trades a
 * day and a week, a deployed-percent ceiling, a per-trade budget) are retired
 * for the rules every order path checks (`lib/risk/gannCapital.ts`): 30 points
 * of capital behind every share held (A-RISK-01) and at most five stocks
 * open at once (A-RISK-08). The three-loss pause (`lib/risk/lossSeries.ts`) is
 * checked where the order is placed. Gann sets no daily trade count (Q8).
 *
 * Read from every open paper position, not only Guided's: Gann's capital is
 * the whole account's. Option legs are left out, as on the order path.
 *
 * Read immediately before a recommendation is rendered and again before an
 * order is submitted, so two tabs cannot both open a fourth market.
 */

import { capitalHeld, MAX_OPEN_STOCKS } from "@/lib/risk/gannCapital";
import { isCryptoSymbol } from "@/lib/market/cryptoSymbol";
import { parseOccSymbol } from "@/lib/portfolio/occ";

export interface CapUsage {
  /** Stocks open now. Guided trades stocks only, so crypto pairs are not counted. */
  openMarkets: string[];
  /** Capital Gann's rule holds behind the open shares, in dollars. */
  capitalHeldUsd: number;
  /** Null when a new market may be opened; otherwise the sentence to show. */
  blockedReason: string | null;
}

export function readCapUsage(openSymbols: Map<string, { qty: number; avgEntry: number }>): CapUsage {
  const open = [...openSymbols]
    .filter(([symbol]) => !parseOccSymbol(symbol))
    .map(([symbol, p]) => ({ symbol, qty: p.qty, price: p.avgEntry }));
  const openMarkets = open.map((p) => p.symbol).filter((symbol) => !isCryptoSymbol(symbol));
  return {
    openMarkets,
    capitalHeldUsd: capitalHeld(open),
    blockedReason:
      openMarkets.length >= MAX_OPEN_STOCKS
        ? `You hold ${openMarkets.length} stocks, and GSPS trades at most ${MAX_OPEN_STOCKS} at once. Close one to open another; the scanner and the ticker pages are unaffected.`
        : null,
  };
}

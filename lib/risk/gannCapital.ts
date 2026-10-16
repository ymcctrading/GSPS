/**
 * Gann's capital rules for opening a position (Q4, Q6; owner, 2026-10-16,
 * "Switch all nine").
 *
 * - A-RISK-01 (W006 p.46, Rule 1, class A): hold at least $3,000 of capital
 *   for every 100 shares traded. Ported as 30 Gann points of capital a share
 *   (`pointScale.ts#gannPoint`, $1 at $42.50), so the rule scales with the
 *   price level the way his point does; the literal dollars are 1930s stock
 *   prices. Every open share counts against the same capital, not only the
 *   new order's.
 * - A-RISK-08 (W022 pp.203-204, class A): specialise in two or three markets
 *   and do not diversify. At most `MAX_OPEN_SYMBOLS` symbols open at once; an
 *   order in a symbol already held is not a new market.
 *
 * Checked on every new entry by `lib/trade/place-order.ts` (paper and live),
 * and used to size Guided and the portfolio manager. Protective orders are
 * never refused.
 *
 * Three-question basis:
 * 1. Gann: as cited, class A.
 * 2. Cycles: no periodicity claim; Dewey does not apply.
 * 3. Hermetic: Correspondence (the same rule at every price level, read in
 *    the market's own point) and Mentalism (attention spread over many
 *    markets is attention lost; "do not diversify").
 */
import { gannPoint } from "@/lib/gann/pointScale";

/** $3,000 per 100 shares at Gann's $1 point. */
export const CAPITAL_POINTS_PER_SHARE = 30;
/** "Two or three markets": the upper end, so a third is allowed. */
export const MAX_OPEN_SYMBOLS = 3;

export function capitalPerShare(price: number): number {
  return CAPITAL_POINTS_PER_SHARE * gannPoint(price);
}

export function maxSharesForCapital(capital: number, price: number): number {
  const per = capitalPerShare(price);
  return per > 0 && capital > 0 ? Math.floor(capital / per + 1e-9) : 0;
}

export interface CapitalRuleInput {
  capital: number;
  symbol: string;
  price: number;
  qty: number;
  /** Open positions, at the price each was opened at. */
  open: { symbol: string; qty: number; price: number }[];
}

export interface CapitalRuleRefusal {
  code: "capital_per_share" | "max_open_symbols";
  error: string;
}

/** Capital Gann's rule holds behind every open share. */
export function capitalHeld(open: CapitalRuleInput["open"]): number {
  return open.reduce((sum, p) => sum + Math.abs(p.qty) * capitalPerShare(p.price), 0);
}

export function capitalRuleRefusal(input: CapitalRuleInput): CapitalRuleRefusal | null {
  const symbol = input.symbol.toUpperCase();
  const held = new Set(input.open.map((p) => p.symbol.toUpperCase()));
  if (!held.has(symbol) && held.size >= MAX_OPEN_SYMBOLS) {
    return {
      code: "max_open_symbols",
      error: `You already hold ${held.size} markets. GSPS trades at most ${MAX_OPEN_SYMBOLS} at once, so close one before opening ${symbol}. Nothing was placed.`,
    };
  }
  const already = capitalHeld(input.open);
  if (already + input.qty * capitalPerShare(input.price) > input.capital + 1e-6) {
    const room = maxSharesForCapital(input.capital - already, input.price);
    return {
      code: "capital_per_share",
      error: `That is more shares than this account's capital carries: GSPS holds ${capitalPerShare(input.price).toFixed(2)} of capital behind each ${symbol} share, so at most ${Math.max(room, 0)} more can be opened. Nothing was placed.`,
    };
  }
  return null;
}

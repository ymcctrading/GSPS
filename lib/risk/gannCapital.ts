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
 * - Never-failing rule 1 (W006 p.46, Rule 1: "never risk more than 10% of
 *   capital on one trade"; *Commodities* p.29 "Capital Required" and p.30
 *   "never risk more than one-tenth of your capital on any one trade", and
 *   rule 1 of the 28, pp.43-45; WSSS Ch. II rule 1; 45 Years pp.15-16): a
 *   trade risks at most `MAX_RISK_FRACTION` of the capital, qty times the
 *   entry-to-stop distance. Gann stacks it on the 30 points of capital in the
 *   same rule (NSTD p.46) and on facing pages (Commodities pp.29-30). The two
 *   meet at his 3-point stop (30 points × 1/10 = 3 points a share), so the
 *   tenth binds only on a wider stop, up to his 5-point cap. "Capital" is
 *   the trading unit (`gannRiskCapital`, A-RISK-04), the capital the per-trade
 *   risk rate already reads; that reading is the engineering choice. It is a
 *   per-trade ceiling, "on any one trade", not a limit on all open risk. The
 *   account's own risk bands (`lib/risk/config.ts`) sit under it.
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
/** "Never risk more than one-tenth of your capital on any one trade." */
export const MAX_RISK_FRACTION = 1 / 10;

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
  code: "capital_per_share" | "max_open_symbols" | "risk_one_tenth";
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

/** The most a single trade may risk: a tenth of the capital, never below zero. */
export function maxRiskForTrade(capital: number): number {
  return capital > 0 ? capital * MAX_RISK_FRACTION : 0;
}

/** The shares a tenth of the capital carries at `riskPerShare` (entry to stop). */
export function maxSharesForRisk(capital: number, riskPerShare: number): number {
  const risk = Math.abs(riskPerShare);
  return risk > 0 && capital > 0 ? Math.floor(maxRiskForTrade(capital) / risk + 1e-9) : 0;
}

export interface RiskTenthInput {
  /** The trading unit (`gannRiskCapital`). */
  capital: number;
  symbol: string;
  entry: number;
  stop: number;
  qty: number;
}

/**
 * Refuses an entry that risks more than a tenth of the capital. Never called
 * for a protective order: closing or reducing a position risks nothing new.
 */
export function riskTenthRefusal(input: RiskTenthInput): CapitalRuleRefusal | null {
  const perShare = Math.abs(input.entry - input.stop);
  const risk = Math.abs(input.qty) * perShare;
  // A cent of slack for rounding to the tick.
  if (risk <= maxRiskForTrade(input.capital) + 0.01) return null;
  const room = maxSharesForRisk(input.capital, perShare);
  return {
    code: "risk_one_tenth",
    error: `That trade risks ${risk.toFixed(2)}, more than a tenth of this account's trading capital (${maxRiskForTrade(input.capital).toFixed(2)}). At this stop at most ${room} ${input.symbol.toUpperCase()} shares can be opened. Nothing was placed.`,
  };
}

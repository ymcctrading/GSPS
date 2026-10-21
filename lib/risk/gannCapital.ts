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
 *   and do not diversify, and never-failing rule 8 (WSSS Ch. II rule 8; 45
 *   Years pp.15-16): "spread risk over 4 or 5 stocks". The stock books give
 *   stocks their own count, so stocks are held to `MAX_OPEN_STOCKS` (owner,
 *   2026-10-16: "5 for stocks") and crypto, which no stock book covers, to
 *   the two or three markets of *Tunnel* and *Commodities*
 *   (`MAX_OPEN_OTHER_MARKETS`). Each class is counted on its own; an order in
 *   a symbol already held is not a new market.
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
import { isCryptoSymbol } from "@/lib/market/cryptoSymbol";

/** $3,000 per 100 shares at Gann's $1 point. */
export const CAPITAL_POINTS_PER_SHARE = 30;
/** "Spread risk over 4 or 5 stocks": the upper end (owner, 2026-10-16). */
export const MAX_OPEN_STOCKS = 5;
/** "Two or three markets" for everything else: the upper end, so a third is allowed. */
export const MAX_OPEN_OTHER_MARKETS = 3;
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
  code: "capital_per_share" | "max_open_symbols" | "risk_one_tenth" | "risk_tenth_of_profits";
  error: string;
}

/** Capital Gann's rule holds behind every open share. */
export function capitalHeld(open: CapitalRuleInput["open"]): number {
  return open.reduce((sum, p) => sum + Math.abs(p.qty) * capitalPerShare(p.price), 0);
}

/** How many markets of this symbol's class may be open at once. */
export function maxOpenMarketsFor(symbol: string): number {
  return isCryptoSymbol(symbol) ? MAX_OPEN_OTHER_MARKETS : MAX_OPEN_STOCKS;
}

/** "BTC/USD" and "BTCUSD" are the same market. */
function marketKey(symbol: string): string {
  return symbol.toUpperCase().replace("/", "");
}

export function capitalRuleRefusal(input: CapitalRuleInput): CapitalRuleRefusal | null {
  const symbol = input.symbol.toUpperCase();
  const crypto = isCryptoSymbol(symbol);
  const held = new Set(input.open.filter((p) => isCryptoSymbol(p.symbol) === crypto).map((p) => marketKey(p.symbol)));
  const cap = maxOpenMarketsFor(symbol);
  if (!held.has(marketKey(symbol)) && held.size >= cap) {
    const kind = crypto ? "crypto pairs" : "stocks";
    return {
      code: "max_open_symbols",
      error: `You already hold ${held.size} ${kind}. GSPS trades at most ${cap} ${kind} at once, so close one before opening ${symbol}. Nothing was placed.`,
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

/**
 * A tenth of the profits after large profits (A-RISK-07, *Tunnel Thru the
 * Air*, W022 pp.198-199, Tier A): "never risk more than 10% of the profits on
 * the first new deal", and after a loss cut the size so the next loss is only
 * 10% of the profits that remain, so the market would have to beat him ten
 * times in a row to take them all. Read on the account's realised position:
 * the ceiling is a tenth of equity above the starting capital, so a loss
 * lowers it at once.
 *
 * Engineering choice, labelled: "large profits" is profits at least equal to
 * the starting capital, the point at which Gann lets the trading unit double
 * (`gannRiskCapital`, A-RISK-04). Below it the tenth of the unit governs
 * alone. `peakProfits` is the most profit the account has banked
 * (`lib/risk/profitPeak.ts`): once it has reached the starting capital, the
 * ceiling holds while any profit remains, so a loss that takes profits back
 * under the starting capital still leaves the next trade a tenth of what is
 * left. With every profit gone the tenth of the unit governs again. With no
 * starting capital on record the rule does not apply.
 *
 * Three-question basis: 1. Gann, as cited. 2. Cycles: no periodicity claim.
 * 3. Hermetic: Cause and Effect, banked profit is the cause the next risk is
 * drawn from, and a loss shrinks it at once.
 */
export function profitRiskCeiling(equity: number, startingCapital: number, peakProfits = 0): number | null {
  if (!(startingCapital > 0)) return null;
  const profits = equity - startingCapital;
  const reached = Math.max(profits, peakProfits) >= startingCapital;
  return reached && profits > 0 ? profits * MAX_RISK_FRACTION : null;
}

/**
 * The most a single trade may risk: a tenth of the capital, never below zero,
 * and never more than a tenth of the profits when that ceiling applies
 * (`profitRiskCeiling`).
 */
export function maxRiskForTrade(capital: number, profitCeiling: number | null = null): number {
  const tenth = capital > 0 ? capital * MAX_RISK_FRACTION : 0;
  return profitCeiling == null ? tenth : Math.max(0, Math.min(tenth, profitCeiling));
}

/** The shares that risk carries at `riskPerShare` (entry to stop). */
export function maxSharesForRisk(capital: number, riskPerShare: number, profitCeiling: number | null = null): number {
  const risk = Math.abs(riskPerShare);
  return risk > 0 && capital > 0 ? Math.floor(maxRiskForTrade(capital, profitCeiling) / risk + 1e-9) : 0;
}

export interface RiskTenthInput {
  /** The trading unit (`gannRiskCapital`). */
  capital: number;
  symbol: string;
  entry: number;
  stop: number;
  qty: number;
  /** A tenth of the profits, when it applies (`profitRiskCeiling`). */
  profitCeiling?: number | null;
}

/**
 * Refuses an entry that risks more than a tenth of the capital, or of the
 * profits after large profits. Never called
 * for a protective order: closing or reducing a position risks nothing new.
 */
export function riskTenthRefusal(input: RiskTenthInput): CapitalRuleRefusal | null {
  const perShare = Math.abs(input.entry - input.stop);
  const risk = Math.abs(input.qty) * perShare;
  // A cent of slack for rounding to the tick.
  const ceiling = input.profitCeiling ?? null;
  const allowed = maxRiskForTrade(input.capital, ceiling);
  if (risk <= allowed + 0.01) return null;
  const room = maxSharesForRisk(input.capital, perShare, ceiling);
  if (ceiling != null && allowed < maxRiskForTrade(input.capital)) {
    return {
      code: "risk_tenth_of_profits",
      error: `That trade risks ${risk.toFixed(2)}, more than a tenth of this account's profits (${allowed.toFixed(2)}). After large profits, a trade may risk only a tenth of them, so a losing run can't take them all. At this stop at most ${room} ${input.symbol.toUpperCase()} shares can be opened. Nothing was placed.`,
    };
  }
  return {
    code: "risk_one_tenth",
    error: `That trade risks ${risk.toFixed(2)}, more than a tenth of this account's trading capital (${maxRiskForTrade(input.capital).toFixed(2)}). At this stop at most ${room} ${input.symbol.toUpperCase()} shares can be opened. Nothing was placed.`,
  };
}

/** Shares an equity option contract controls, for the premium at risk. */
export const OPTION_CONTRACT_MULTIPLIER = 100;

/**
 * Never-failing rule 1 on a bought option (review finding F-04, 2026-10-21).
 * The Q31 broker exception exempts options from the stop requirement, because
 * no staged exit is placed on them; it never exempted them from rule 1. A
 * bought option can lose its whole premium, so the premium paid is the risk,
 * held to the same tenth of the trading unit (or of the profits) as a share.
 */
export function optionPremiumRefusal(input: {
  capital: number;
  symbol: string;
  premium: number;
  contracts: number;
  profitCeiling?: number | null;
}): CapitalRuleRefusal | null {
  const perContract = Math.abs(input.premium) * OPTION_CONTRACT_MULTIPLIER;
  const risk = Math.abs(input.contracts) * perContract;
  const allowed = maxRiskForTrade(input.capital, input.profitCeiling ?? null);
  if (risk <= allowed + 0.01) return null;
  const room = perContract > 0 ? Math.floor(allowed / perContract + 1e-9) : 0;
  return {
    code: "risk_one_tenth",
    error: `That option costs ${risk.toFixed(2)} in premium, all of it at risk, which is more than a tenth of this account's trading capital (${allowed.toFixed(2)}). At this premium at most ${room} ${input.symbol.toUpperCase()} contracts can be bought. Nothing was placed.`,
  };
}

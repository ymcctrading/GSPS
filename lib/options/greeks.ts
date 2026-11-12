/**
 * Black-Scholes option pricing and greeks, at zero risk-free rate.
 * -----------------------------------------------------------------------------
 * Shared by the simulated options chain (`lib/data/synthetic.ts`) and blended
 * open-position tracking (`lib/portfolio/blend.ts`) so both compute greeks from
 * the same formulas — a delta shown in the chain and a delta shown for the same
 * strike in Open Positions should never disagree because one path rounded
 * differently than the other.
 *
 * Zero rates is a deliberate simplification: this app has no risk-free-rate feed,
 * and for the short-dated, near-the-money contracts the chain and position
 * tracker deal in, the rate term's effect on greeks is small next to the
 * uncertainty already in the IV estimate itself.
 */

import { etCloseInstantOn } from "@/lib/market/session";

export type OptionSide = "call" | "put";

/** Standard normal PDF. */
export function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/** Standard normal CDF via the Abramowitz-Stegun approximation (good to ~1e-7). */
export function normCdf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-ax * ax);
  return 0.5 * (1 + sign * y);
}

function d1d2(spot: number, strike: number, t: number, sigma: number) {
  const sigmaRootT = Math.max(1e-6, sigma * Math.sqrt(t));
  const d1 = (Math.log(spot / strike) + 0.5 * sigma * sigma * t) / sigmaRootT;
  return { d1, d2: d1 - sigmaRootT, sigmaRootT };
}

/** Theoretical premium for one share of the option (not the ×100 contract). */
export function blackScholesPrice(
  side: OptionSide,
  spot: number,
  strike: number,
  t: number,
  sigma: number,
): number {
  if (t <= 0) {
    return side === "call" ? Math.max(0, spot - strike) : Math.max(0, strike - spot);
  }
  const { d1, d2 } = d1d2(spot, strike, t, sigma);
  return side === "call"
    ? spot * normCdf(d1) - strike * normCdf(d2)
    : strike * normCdf(-d2) - spot * normCdf(-d1);
}

export interface Greeks {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
}

/** Greeks at a given spot/strike/time/vol. `t` is in years. */
export function computeGreeks(side: OptionSide, spot: number, strike: number, t: number, sigma: number): Greeks {
  if (t <= 0) {
    const itm = side === "call" ? spot > strike : spot < strike;
    return { delta: itm ? (side === "call" ? 1 : -1) : 0, gamma: 0, theta: 0, vega: 0 };
  }
  const { d1, sigmaRootT } = d1d2(spot, strike, t, sigma);
  const pdf = normPdf(d1);
  const delta = side === "call" ? normCdf(d1) : normCdf(d1) - 1;
  const gamma = pdf / (spot * sigmaRootT);
  const theta = -(spot * pdf * sigma) / (2 * Math.sqrt(t)) / 365; // per calendar day
  const vega = (spot * pdf * Math.sqrt(t)) / 100; // per 1 vol point (1%)
  return {
    delta: Math.round(delta * 10000) / 10000,
    gamma: Math.round(gamma * 10000) / 10000,
    theta: Math.round(theta * 10000) / 10000,
    vega: Math.round(vega * 10000) / 10000,
  };
}

/**
 * Back out implied volatility from an observed premium via bisection — robust
 * over the full domain (unlike Newton's method, it can't diverge), and IV only
 * needs a few significant figures here so the extra iterations of a
 * derivative-based solver buy nothing.
 */
export function impliedVolatility(
  side: OptionSide,
  spot: number,
  strike: number,
  t: number,
  price: number,
): number {
  if (t <= 0 || price <= 0) return 0;
  let lo = 0.001;
  let hi = 5; // 500% IV ceiling — well past anything that occurs in practice
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const p = blackScholesPrice(side, spot, strike, t, mid);
    if (p > price) hi = mid;
    else lo = mid;
  }
  return Math.round(((lo + hi) / 2) * 1000) / 1000;
}

/** Year-fraction between two dates, floored so same-day/expired contracts don't divide by zero. */
export function yearsBetween(from: Date, to: Date): number {
  const days = (to.getTime() - from.getTime()) / (24 * 3600 * 1000);
  return Math.max(days, 1) / 365;
}

/** One hour, in years: the shortest time to expiry the model is asked to price. */
const MIN_T_YEARS = 1 / (365 * 24);

/**
 * Years from `now` to the contract's last trading moment: the regular close
 * (16:00 ET, 13:00 on an early close) of its expiration date. Floored at one
 * hour so an expiring contract still prices; a same-day contract is not
 * treated as a full day away, which overstated its time value and so
 * understated its IV.
 */
export function yearsToExpiry(expiration: string, now: Date = new Date()): number {
  const ms = etCloseInstantOn(expiration).getTime() - now.getTime();
  return Math.max(ms / (365 * 24 * 3600 * 1000), MIN_T_YEARS);
}

/** Where a contract's IV and greeks came from. */
export type GreeksSource = "feed" | "model" | "none";

export interface ModelledGreeks {
  /** Annualized implied volatility (0.25 = 25%), or null when none solves. */
  iv: number | null;
  greeks: Greeks | null;
  source: GreeksSource;
}

/**
 * IV and greeks from one observed premium: the IV that reprices the premium
 * (Black-Scholes, zero rate), then the greeks at that IV.
 *
 * Nothing is invented. A premium at or below intrinsic value, or above the
 * underlying itself for a call (the strike for a put), has no volatility that
 * reprices it, so it reads as unavailable rather than as a 0.1% or 500% IV
 * from the solver's bounds. The chain, the order tickets and Open Positions
 * all read greeks through this one function, so the same contract shows the
 * same numbers on every surface.
 */
export function modelGreeksFromPremium(
  side: OptionSide,
  spot: number,
  strike: number,
  expiration: string,
  premium: number | null,
  now: Date = new Date(),
): ModelledGreeks {
  const none: ModelledGreeks = { iv: null, greeks: null, source: "none" };
  if (!(spot > 0) || !(strike > 0) || premium == null || !(premium > 0)) return none;
  const intrinsic = side === "call" ? Math.max(0, spot - strike) : Math.max(0, strike - spot);
  const ceiling = side === "call" ? spot : strike;
  if (premium <= intrinsic || premium >= ceiling) return none;
  const t = yearsToExpiry(expiration, now);
  const iv = impliedVolatility(side, spot, strike, t, premium);
  if (!(iv > 0.002) || iv >= 4.99) return none;
  return { iv, greeks: computeGreeks(side, spot, strike, t, iv), source: "model" };
}

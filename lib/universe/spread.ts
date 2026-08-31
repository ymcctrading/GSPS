/**
 * `spread_pass` — "reject where friction is material."
 *
 * `lib/signals/scanGates.ts` already documents why this cannot be a real
 * read yet: "No bid/ask spread feed exists yet — the liquidity floor is
 * used as the best available proxy for 'cost to enter is acceptable' until
 * one does." This module keeps that same honest fallback rather than
 * inventing a second, different stub: when a real bid/ask is supplied it
 * applies both of the spec's tests directly; when none is supplied, it
 * falls back to the Novice liquidity read already computed for
 * `liquidity_pass`, on the same reasoning scanGates.ts uses.
 *
 * Wiring a real bid/ask feed in is tracked as future work in
 * `docs/MARKET_UNIVERSE_DATA_QUALITY.md` — once one exists, drop the
 * fallback branch below rather than layering a third proxy on top of it.
 */

import { MAX_SPREAD_FRACTION_OF_STOP, MAX_SPREAD_PCT_OF_PRICE } from "./config";
import type { UniverseFilterResult } from "./types";

/** `policy_values`-overridable ceilings — see lib/universe/policy.ts. Defaults are the same constants this file always used. */
export interface SpreadThresholds {
  maxSpreadPctOfPrice: number;
  maxSpreadFractionOfStop: number;
}

export const DEFAULT_SPREAD_THRESHOLDS: SpreadThresholds = {
  maxSpreadPctOfPrice: MAX_SPREAD_PCT_OF_PRICE,
  maxSpreadFractionOfStop: MAX_SPREAD_FRACTION_OF_STOP,
};

export interface SpreadQuote {
  bid: number;
  ask: number;
  price: number;
  /** Entry-to-stop distance in dollars, when a plan is already priced. Omit to skip the stop-fraction test. */
  stopDistance?: number | null;
}

export function spreadPass(
  quote: SpreadQuote | null,
  liquidityPassed: boolean,
  thresholds: SpreadThresholds = DEFAULT_SPREAD_THRESHOLDS,
): UniverseFilterResult {
  if (quote === null) {
    return liquidityPassed
      ? {
          key: "spread_pass",
          pass: true,
          reason: null,
        }
      : {
          key: "spread_pass",
          pass: false,
          reason:
            "No bid/ask feed is available for this symbol, and it does not clear the liquidity floor used as a proxy for acceptable friction.",
        };
  }

  const { bid, ask, price, stopDistance } = quote;
  if (!(bid > 0) || !(ask > 0) || ask < bid || !(price > 0)) {
    return { key: "spread_pass", pass: false, reason: "Bid/ask quote is invalid or crossed." };
  }

  const spread = ask - bid;
  const spreadPctOfPrice = (spread / price) * 100;
  if (spreadPctOfPrice > thresholds.maxSpreadPctOfPrice) {
    return {
      key: "spread_pass",
      pass: false,
      reason: `Spread is ${spreadPctOfPrice.toFixed(2)}% of price, above the ${thresholds.maxSpreadPctOfPrice}% ceiling.`,
    };
  }

  if (stopDistance !== undefined && stopDistance !== null && stopDistance > 0) {
    const spreadFractionOfStop = spread / stopDistance;
    if (spreadFractionOfStop > thresholds.maxSpreadFractionOfStop) {
      return {
        key: "spread_pass",
        pass: false,
        reason: `Spread eats ${(spreadFractionOfStop * 100).toFixed(0)}% of the planned stop distance, above the ${thresholds.maxSpreadFractionOfStop * 100}% ceiling.`,
      };
    }
  }

  return { key: "spread_pass", pass: true, reason: null };
}

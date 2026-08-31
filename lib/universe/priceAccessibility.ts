/**
 * `price_or_fractional_pass` — "price alone never qualifies a stock."
 *
 * The spec's accessible band ($10–$125) exists to keep a small account from
 * being unable to buy even one share, or from having one expensive share
 * dominate its whole allocation. Outside the band a symbol is still eligible
 * if fractional-share support is *confirmed* — never assumed — at the
 * broker in scope. `fractionalConfirmed: null` (unknown) fails, matching the
 * spec's "unknown data defaults to block" rule applied to broker
 * capabilities, same as everywhere else in this engine.
 */

import { PRICE_BAND_MAX_USD, PRICE_BAND_MIN_USD } from "./config";
import type { UniverseFilterResult } from "./types";

/** `policy_values`-overridable band — see lib/universe/policy.ts. Defaults are the same constants this file always used. */
export interface PriceBandThresholds {
  priceBandMinUsd: number;
  priceBandMaxUsd: number;
}

export const DEFAULT_PRICE_BAND_THRESHOLDS: PriceBandThresholds = {
  priceBandMinUsd: PRICE_BAND_MIN_USD,
  priceBandMaxUsd: PRICE_BAND_MAX_USD,
};

export function priceOrFractionalPass(
  price: number | null,
  fractionalConfirmed: boolean | null,
  thresholds: PriceBandThresholds = DEFAULT_PRICE_BAND_THRESHOLDS,
): UniverseFilterResult {
  if (price === null || !(price > 0)) {
    return { key: "price_or_fractional_pass", pass: false, reason: "No current price available." };
  }

  const inBand = price >= thresholds.priceBandMinUsd && price <= thresholds.priceBandMaxUsd;
  if (inBand) {
    return { key: "price_or_fractional_pass", pass: true, reason: null };
  }

  if (fractionalConfirmed === true) {
    return { key: "price_or_fractional_pass", pass: true, reason: null };
  }

  const priceReason =
    price < thresholds.priceBandMinUsd
      ? `Trades at $${price.toFixed(2)}, below the $${thresholds.priceBandMinUsd} accessible-price floor`
      : `Trades at $${price.toFixed(2)}, above the $${thresholds.priceBandMaxUsd} accessible-price ceiling`;

  return {
    key: "price_or_fractional_pass",
    pass: false,
    reason:
      fractionalConfirmed === false
        ? `${priceReason}, and this broker does not support fractional shares.`
        : `${priceReason}, and fractional-share support at this broker could not be confirmed.`,
  };
}

/**
 * `volatility_pass` — a two-sided ATR% band.
 *
 * The spec requires a `volatility_pass` filter without naming a specific
 * band (unlike, say, the market-cap floor, which the spec states outright).
 * The band here is engineering-chosen, in the same spirit as
 * `lib/scan/liquidity.ts`'s floor: too little volatility and a normal hold
 * window cannot reach a meaningful target; too much and the stop distance
 * required to survive ordinary noise no longer fits inside the Novice risk
 * budget (`lib/risk/config.ts`'s 1.00%–2.00% ladder). Reuses the same ATR(14)
 * helper the Signal and Regime Engine's regime classifier already relies on
 * (`lib/analysis/pivots.ts`), so the two engines cannot silently disagree on
 * what "volatility" means.
 */

import { atr } from "@/lib/analysis/pivots";
import type { Bar } from "@/lib/types";
import { MAX_ATR_PCT_OF_PRICE, MIN_ATR_PCT_OF_PRICE } from "./config";
import type { UniverseFilterResult } from "./types";

export function volatilityPass(dailyBars: Bar[], atrPeriod = 14): UniverseFilterResult {
  if (dailyBars.length < atrPeriod + 1) {
    return {
      key: "volatility_pass",
      pass: false,
      reason: "Not enough recent daily bars to read volatility.",
    };
  }

  const price = dailyBars[dailyBars.length - 1].c;
  if (!(price > 0)) {
    return { key: "volatility_pass", pass: false, reason: "No current price available to scale volatility against." };
  }

  const atrValue = atr(dailyBars, atrPeriod);
  const atrPctOfPrice = (atrValue / price) * 100;

  if (atrPctOfPrice < MIN_ATR_PCT_OF_PRICE) {
    return {
      key: "volatility_pass",
      pass: false,
      reason: `ATR is ${atrPctOfPrice.toFixed(2)}% of price, below the ${MIN_ATR_PCT_OF_PRICE}% floor — too little movement to reach a meaningful target inside a normal hold window.`,
    };
  }
  if (atrPctOfPrice > MAX_ATR_PCT_OF_PRICE) {
    return {
      key: "volatility_pass",
      pass: false,
      reason: `ATR is ${atrPctOfPrice.toFixed(2)}% of price, above the ${MAX_ATR_PCT_OF_PRICE}% ceiling — the stop distance required to survive normal noise no longer fits the Novice risk budget.`,
    };
  }

  return { key: "volatility_pass", pass: true, reason: null };
}

/**
 * Forward-thinking reversal-pattern detection per the protocol doc:
 * patterns are armed on CLOSED bars and produce trigger lines for the NEXT
 * live candle (break by one penny). Never detected in hindsight.
 */

import type { Bar, StratPattern } from "@/lib/types";
import { classifySeries } from "./classify";

const PENNY = 0.01;

/** All armed setups on a closed-bar series, most specific first. */
export function detectPatterns(bars: Bar[]): StratPattern[] {
  if (bars.length < 4) return [];
  const states = classifySeries(bars); // states[i] classifies bars[i+1]
  const last = bars[bars.length - 1];
  const prev = bars[bars.length - 2];
  const lastState = states[states.length - 1];
  const prevState = states[states.length - 2];

  const patterns: StratPattern[] = [];

  // --- 2-1-2 continuation: closed 2-bar then closed inside bar. Trigger on
  // break of the inside bar (bullish: high + 1¢; bearish: low − 1¢).
  if (lastState === "1") {
    if (prevState === "2U") {
      patterns.push({
        name: "2-1-2",
        direction: "bullish",
        triggerPrice: last.h + PENNY,
        stopPrice: last.l - PENNY,
        description: "Bullish 2-1-2 continuation: buy-stop one penny above the inside bar high.",
      });
    }
    if (prevState === "2D") {
      patterns.push({
        name: "2-1-2",
        direction: "bearish",
        triggerPrice: last.l - PENNY,
        stopPrice: last.h + PENNY,
        description: "Bearish 2-1-2 continuation: sell-stop one penny below the inside bar low.",
      });
    }
    // --- 3-1-2: outside bar then inside bar; break of the inside bar either way.
    if (prevState === "3") {
      patterns.push({
        name: "3-1-2",
        direction: "bullish",
        triggerPrice: last.h + PENNY,
        stopPrice: last.l - PENNY,
        description: "3-1-2 bullish: buy-stop one penny above the inside bar high after an outside bar.",
      });
      patterns.push({
        name: "3-1-2",
        direction: "bearish",
        triggerPrice: last.l - PENNY,
        stopPrice: last.h + PENNY,
        description: "3-1-2 bearish: sell-stop one penny below the inside bar low after an outside bar.",
      });
    }
  }

  // --- 2-2 reversal (Scenario A): a closed directional bar; the reversal fires
  // if the next live candle breaks one penny past its opposite extreme. The bar
  // BEFORE the trigger bar sharpens the read: an inside bar first is a 1-2-2, an
  // outside bar first is a 3-2-2 — both higher-conviction than a bare 2-2.
  const revName: StratPattern["name"] =
    prevState === "1" ? "1-2-2" : prevState === "3" ? "3-2-2" : "2-2";
  const revContext =
    prevState === "1"
      ? " off a prior inside bar (1-2-2)"
      : prevState === "3"
        ? " off a prior outside bar (3-2-2)"
        : "";
  if (lastState === "2U") {
    patterns.push({
      name: revName,
      direction: "bearish",
      triggerPrice: last.l - PENNY,
      stopPrice: last.h + PENNY,
      description: `Bearish ${revName} reversal${revContext}: sell-stop one penny below the low of the up bar.`,
    });
  }
  if (lastState === "2D") {
    patterns.push({
      name: revName,
      direction: "bullish",
      triggerPrice: last.h + PENNY,
      stopPrice: last.l - PENNY,
      description: `Bullish ${revName} reversal${revContext}: buy-stop one penny above the high of the down bar.`,
    });
  }

  // --- Pivot Machine Gun: ≥5 consecutive lower highs → bullish detonation on
  // break of the last bar's high (mirror for consecutive higher lows).
  let lowerHighs = 0;
  for (let i = bars.length - 1; i > 0; i--) {
    if (bars[i].h < bars[i - 1].h) lowerHighs++;
    else break;
  }
  if (lowerHighs >= 5) {
    patterns.push({
      name: "PMG",
      direction: "bullish",
      triggerPrice: last.h + PENNY,
      stopPrice: last.l - PENNY,
      description: `Momentum reversal (PMG): ${lowerHighs} consecutive lower highs — a buy-stop above the last high triggers as trapped sellers are stopped out.`,
    });
  }
  let higherLows = 0;
  for (let i = bars.length - 1; i > 0; i--) {
    if (bars[i].l > bars[i - 1].l) higherLows++;
    else break;
  }
  if (higherLows >= 5) {
    patterns.push({
      name: "PMG",
      direction: "bearish",
      triggerPrice: last.l - PENNY,
      stopPrice: last.h + PENNY,
      description: `Momentum reversal (PMG): ${higherLows} consecutive higher lows — a sell-stop below the last low triggers as trapped buyers are stopped out.`,
    });
  }

  void prev;
  return patterns;
}

/**
 * The Gap Rule (Module V, Step 4): if the live/open price has already gapped
 * completely past the trigger line, the setup is void.
 */
export function gapRuleViolated(pattern: StratPattern, currentPrice: number): boolean {
  if (pattern.direction === "bullish") {
    // Gapped above the buy-stop: structural conflict, purge the setup.
    return currentPrice > pattern.triggerPrice + Math.abs(pattern.triggerPrice) * 0.002;
  }
  return currentPrice < pattern.triggerPrice - Math.abs(pattern.triggerPrice) * 0.002;
}

/**
 * Minimum stop distance, as a fraction of the average bar range on the
 * execution timeframe. The structural stop sits one penny outside the trigger
 * candle, so a narrow bar yields a correspondingly narrow stop — and when the
 * average candle is three times wider than the entire trade's risk, ordinary
 * noise takes the trade out before the thesis has a chance to play. Measuring
 * against ATR rather than a fixed amount keeps the floor meaningful across
 * instruments, price levels and asset classes.
 *
 * A third was chosen against a year of AAPL 15-minute bars: of 1,225 armed
 * setups it rejects 12.4%, concentrated in the inside-bar patterns (3-1-2 29%,
 * 2-1-2 20%) whose trigger candle is narrow by construction. It trims the
 * untradeable tail rather than culling the signal.
 */
export const MIN_RISK_ATR_FRACTION = 1 / 3;

/**
 * Minimum stop distance as a fraction of the trigger price, so that spread and
 * slippage stay a small share of the move rather than the bulk of it. Also the
 * backstop when ATR is unavailable — a flat or too-short series returns 0.
 */
export const MIN_RISK_PCT_OF_PRICE = 0.001;

/**
 * A setup whose stop is too tight to survive normal noise, or too tight to
 * clear its own transaction costs, is not tradeable however clean the pattern
 * looks. Both floors must clear.
 */
export function riskFloorViolated(pattern: StratPattern, executionAtr: number): boolean {
  const risk = Math.abs(pattern.triggerPrice - pattern.stopPrice);
  if (risk < Math.abs(pattern.triggerPrice) * MIN_RISK_PCT_OF_PRICE) return true;
  return executionAtr > 0 && risk < executionAtr * MIN_RISK_ATR_FRACTION;
}

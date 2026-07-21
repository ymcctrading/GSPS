/**
 * Forward-thinking Strat pattern detection per the Gann Protocol doc:
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
  // if the next live candle breaks one penny past its opposite extreme.
  if (lastState === "2U") {
    patterns.push({
      name: "2-2",
      direction: "bearish",
      triggerPrice: last.l - PENNY,
      stopPrice: last.h + PENNY,
      description: "Bearish 2-2 reversal: sell-stop one penny below the 2-up bar low.",
    });
  }
  if (lastState === "2D") {
    patterns.push({
      name: "2-2",
      direction: "bullish",
      triggerPrice: last.h + PENNY,
      stopPrice: last.l - PENNY,
      description: "Bullish 2-2 reversal: buy-stop one penny above the 2-down bar high.",
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
      description: `Pivot Machine Gun: ${lowerHighs} consecutive lower highs — buy-stop above the last high detonates the short stop cluster.`,
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
      description: `Pivot Machine Gun: ${higherLows} consecutive higher lows — sell-stop below the last low detonates the long stop cluster.`,
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

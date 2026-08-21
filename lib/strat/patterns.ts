/**
 * Forward-thinking reversal-pattern detection per the protocol doc:
 * patterns are armed on CLOSED bars and produce trigger lines for the NEXT
 * live candle (break by one penny). Never detected in hindsight.
 */

import type { Bar, StratPattern } from "@/lib/types";
import { classifySeries } from "./classify";

const PENNY = 0.01;

/**
 * The shapes that break in the direction the bar sequence was already going —
 * an inside bar consolidating inside a trend, then resolving with it. The 2-2
 * family (including 1-2-2 and 3-2-2) reverses the last directional bar instead,
 * and PMG detonates against a run of pivots, so neither continues a trend.
 */
export const CONTINUATION_PATTERNS: ReadonlySet<StratPattern["name"]> = new Set([
  "2-1-2",
  "3-1-2",
]);

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
  return dedupeByOrder(patterns);
}

/**
 * Collapse setups that are the same order at the same risk, just labelled by
 * different rules that happened to both fire.
 *
 * The 2-2/1-2-2/3-2-2 reversal family and PMG use the identical trigger/stop
 * formula (last bar's high+penny / low-penny), so a bar that both completes a
 * ≥5-pivot PMG run AND reads as a directional "2" bar — a common combination,
 * since a decisive reversal candle is exactly the kind of bar that ends a
 * streak of lower highs or higher lows — used to arm as two separate patterns
 * with identical direction, triggerPrice and stopPrice. A trader (and the
 * replay counting trades) can only take that stop order once; keeping both
 * double-counted every such setup as two trades sharing one outcome.
 *
 * Kept name matches lib/scanTicker.ts's own specificity ranking (compound
 * patterns > PMG > a bare "2-2", which arms on almost every directional bar)
 * rather than array order, so the single shared detector and the live
 * scanner's display agree on which label is the more informative one.
 */
function dedupeByOrder(patterns: StratPattern[]): StratPattern[] {
  const specificity: Record<StratPattern["name"], number> = {
    "2-1-2": 0,
    "3-1-2": 0,
    "1-2-2": 0,
    "3-2-2": 0,
    PMG: 1,
    "2-2": 2,
  };
  const bestByKey = new Map<string, StratPattern>();
  for (const p of patterns) {
    const key = `${p.direction}|${p.triggerPrice}|${p.stopPrice}`;
    const existing = bestByKey.get(key);
    if (!existing || specificity[p.name] < specificity[existing.name]) {
      bestByKey.set(key, p);
    }
  }
  return [...bestByKey.values()];
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
 * Raised from a third to three quarters after replaying the entry logic over
 * ~48 sessions of 15-minute bars on AAPL, MSFT, NVDA, QQQ, SPY and TSLA
 * (lib/backtest/replay.ts, 2,213 triggered trades). Expectancy improves
 * monotonically as the floor rises — at a 2R target, -0.142R per trade at a
 * third, -0.128R at a half, -0.083R at three quarters — and the same ordering
 * holds at a 1R target, so this is a trend across buckets rather than one
 * lucky slice.
 *
 * Three quarters rather than 1.0x, which measured better still (-0.057R), on
 * the grounds that it keeps half the setups instead of a quarter; a floor
 * tuned to the best number on two months of six symbols is a floor fitted to
 * noise. Note this halves the setups reaching the scanner.
 *
 * It does not make the entry logic profitable. Expectancy is negative at every
 * floor and every target tested. This narrows the loss; it does not turn it.
 */
export const MIN_RISK_ATR_FRACTION = 0.75;

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

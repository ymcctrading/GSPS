/**
 * Trade levels per the protocol:
 *  - Entry: the pattern trigger line (break by one penny).
 *  - Stop: structural — one penny opposite the trigger candle ("no exceptions").
 *  - TP1: 2R (two-to-one reward:risk), or the previous candle's high/low if
 *    that structural target is further than 2R.
 *  - Master profit: 3R, stretched to the nearest structural extension when one
 *    sits beyond 3R within reason; always kept beyond TP1, stepping out a
 *    further 1R when a structural TP1 has already run past 3R.
 *  - Stop sanity: advisory only — the structural stop always wins. Which
 *    advisory applies depends on what is known (see the warning block below).
 */

import type { Bar, StratPattern, TradeLevels } from "@/lib/types";
import { readPremiumStop } from "@/lib/trade/premium-stop";

/**
 * Widest structural stop worth taking on the execution timeframe, in average
 * candles. This is the ceiling to the floor in lib/strat/patterns.ts: below a
 * third of an average candle the stop is inside the noise, above two and a
 * half the structural level is so far away that TP1 at 2R needs a five-candle
 * run to pay. Measured over ~48 sessions of AAPL 15-minute bars, it flags the
 * widest 2.7% of setups that clear the floor (median 0.8x, p95 2.0x), and it
 * sits inside the 1.5–3x ATR range conventionally used for stop placement.
 */
export const MAX_STOP_ATR_MULTIPLE = 2.5;

export function computeTradeLevels(
  pattern: StratPattern,
  previousBar: Bar,
  gannTargets: number[],
  optionPremium?: number,
  executionAtr?: number,
): TradeLevels {
  const entry = pattern.triggerPrice;
  const stopLoss = pattern.stopPrice;
  const risk = Math.abs(entry - stopLoss);
  const dir = pattern.direction === "bullish" ? 1 : -1;

  // A pattern whose trigger and structural stop are the same price has no risk
  // to size against and no R-multiple to project targets from. Every detected
  // pattern puts them a penny either side of a bar, so this only fires on
  // corrupt input.
  if (risk <= 0) {
    throw new Error(
      `Invalid trade levels: entry and stop are both ${round(entry)} — the pattern has no risk to size against.`,
    );
  }

  // TP1: max(2R, structural previous-candle extreme in the trade direction)
  const structuralT1 = pattern.direction === "bullish" ? previousBar.h : previousBar.l;
  const twoR = entry + dir * 2 * risk;
  const takeProfit1 =
    dir * (structuralT1 - entry) > dir * (twoR - entry) && dir * (structuralT1 - entry) > 0
      ? structuralT1
      : twoR;

  // Master profit: 3R, or the nearest structural extension beyond it (capped
  // at 5R). A structural TP1 lifted from the previous candle can legitimately
  // sit at or past 3R on a wide bar — that is a real market condition, not a
  // corrupt signal — so in that case the master target steps out a further 1R
  // beyond TP1 and the extension search window moves with it.
  const threeR = entry + dir * 3 * risk;
  const fiveR = entry + dir * 5 * risk;
  const tp1Overruns3R = dir * (takeProfit1 - threeR) >= 0;
  // Everything the master target may snap to has to clear this floor…
  const masterFloor = tp1Overruns3R ? takeProfit1 : threeR;
  // …and this is where it lands when nothing structural is in range.
  const steppedMaster = tp1Overruns3R ? takeProfit1 + dir * risk : threeR;
  const masterCap = dir * (fiveR - steppedMaster) > 0 ? fiveR : steppedMaster + dir * risk;
  const structuralExtension = gannTargets
    .filter((g) => dir * (g - masterFloor) > 0 && dir * (g - masterCap) <= 0)
    .sort((a, b) => dir * (a - b))[0];
  const masterProfit = structuralExtension ?? steppedMaster;

  const stopPctOfPrice = (risk / entry) * 100;
  let stopBandWarning: string | null = null;

  if (optionPremium && optionPremium > 0) {
    // The scan has a premium but never a delta, so this reading assumes the
    // contract moves point-for-point with the underlying. The strike ticket
    // knows the contract's delta and reports the exact figure — same rule,
    // same wording, from lib/trade/premium-stop.ts.
    stopBandWarning = readPremiumStop({ risk, premium: optionPremium })?.warning ?? null;
  } else if (executionAtr && executionAtr > 0) {
    // No premium: the honest question is whether the stop is sane for how much
    // this instrument moves, not what fraction of the notional it represents.
    // Measuring against share price puts every intraday structural stop at
    // 0.1–1%, which can never reach 12% — so the old fallback warned on every
    // equity scan, and told the reader to increase size while doing it.
    const atrMultiple = risk / executionAtr;
    if (atrMultiple > MAX_STOP_ATR_MULTIPLE) {
      stopBandWarning = `Structural stop is ${atrMultiple.toFixed(1)}× the average candle on the execution timeframe — an unusually wide setup. Reduce size, or wait for a tighter trigger.`;
    }
  }

  // Invariant: master profit must be strictly more extreme than TP1, which
  // must be strictly more extreme than entry, in the trade direction. The
  // target derivation above guarantees this for any well-formed pattern, so
  // these are assertions against corrupt input rather than an expected outcome
  // — a structural TP1 running past 3R is handled, not rejected.
  if (dir * (takeProfit1 - entry) <= 0) {
    throw new Error(
      `Invalid trade levels: TP1 (${round(takeProfit1)}) is not beyond entry (${round(entry)}) in the ${pattern.direction} direction.`,
    );
  }
  if (dir * (masterProfit - takeProfit1) <= 0) {
    throw new Error(
      `Invalid trade levels: master profit (${round(masterProfit)}) is not more extreme than TP1 (${round(takeProfit1)}) in the ${pattern.direction} direction.`,
    );
  }

  return {
    entry: round(entry),
    stopLoss: round(stopLoss),
    takeProfit1: round(takeProfit1),
    masterProfit: round(masterProfit),
    riskPerShare: round(risk),
    rewardToRiskTp1: risk > 0 ? Math.abs(takeProfit1 - entry) / risk : 0,
    rewardToRiskMaster: risk > 0 ? Math.abs(masterProfit - entry) / risk : 0,
    stopPctOfPrice,
    stopBandWarning,
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

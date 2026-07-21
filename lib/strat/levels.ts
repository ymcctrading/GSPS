/**
 * Trade levels per the protocol:
 *  - Entry: the pattern trigger line (break by one penny).
 *  - Stop: structural — one penny opposite the trigger candle ("no exceptions").
 *  - TP1: 2R (two-to-one reward:risk), or the previous candle's high/low if
 *    that structural target is further than 2R.
 *  - Master profit: 3R, stretched to the nearest Gann extension when one sits
 *    beyond 3R within reason.
 *  - Recommended stop sanity band: 12–18% of price paid (warning only; the
 *    structural stop always wins).
 */

import type { Bar, StratPattern, TradeLevels } from "@/lib/types";

export function computeTradeLevels(
  pattern: StratPattern,
  previousBar: Bar,
  gannTargets: number[],
  optionPremium?: number,
): TradeLevels {
  const entry = pattern.triggerPrice;
  const stopLoss = pattern.stopPrice;
  const risk = Math.abs(entry - stopLoss);
  const dir = pattern.direction === "bullish" ? 1 : -1;

  // TP1: max(2R, structural previous-candle extreme in the trade direction)
  const structuralT1 = pattern.direction === "bullish" ? previousBar.h : previousBar.l;
  const twoR = entry + dir * 2 * risk;
  const takeProfit1 =
    dir * (structuralT1 - entry) > dir * (twoR - entry) && dir * (structuralT1 - entry) > 0
      ? structuralT1
      : twoR;

  // Master profit: 3R, or the nearest Gann extension beyond 3R (capped at 5R)
  const threeR = entry + dir * 3 * risk;
  const fiveR = entry + dir * 5 * risk;
  const gannBeyond = gannTargets
    .filter((g) => dir * (g - threeR) > 0 && dir * (g - fiveR) <= 0)
    .sort((a, b) => dir * (a - b))[0];
  const masterProfit = gannBeyond ?? threeR;

  const basis = optionPremium ?? entry;
  const stopPctOfPrice = (risk / basis) * 100;
  let stopBandWarning: string | null = null;
  if (stopPctOfPrice < 12) {
    stopBandWarning = `Structural stop is ${stopPctOfPrice.toFixed(1)}% of price — tighter than the recommended 12–18% band. Position size can be increased or entries may whipsaw.`;
  } else if (stopPctOfPrice > 18) {
    stopBandWarning = `Structural stop is ${stopPctOfPrice.toFixed(1)}% of price — wider than the recommended 12–18% band. Reduce size or skip.`;
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

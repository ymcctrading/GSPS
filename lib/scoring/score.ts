/**
 * The Score out of 9 — one point per confirmed confluence condition.
 * 7–9 Execute · 4–6 Watch · 0–3 Reject.
 */

import type {
  GannLevels,
  ScanDecision,
  ScoreBreakdownItem,
  StratPattern,
  TradeLevels,
  TrendReading,
} from "@/lib/types";

export interface ScoreInputs {
  direction: "bullish" | "bearish";
  macroTrends: TrendReading[]; // monthly/weekly/daily
  hourlyTrend: TrendReading;
  gann: GannLevels;
  nearSupportResistance: boolean;
  pattern: StratPattern | null;
  momentumElevated: boolean;
  earningsSoon: boolean | null; // null = unknown
  levels: TradeLevels | null;
}

export function computeScore(inputs: ScoreInputs): ScanDecision {
  const {
    direction, macroTrends, hourlyTrend, gann,
    nearSupportResistance, pattern, momentumElevated, earningsSoon, levels,
  } = inputs;

  // For a reversion setup, the macro context "supports" it when the recent
  // trend runs OPPOSITE the setup direction (an extended move into the level).
  const opposite = direction === "bullish" ? "bearish" : "bullish";
  const macroExtended = macroTrends.filter((t) => t.direction === opposite).length >= 2;

  const hourlyAgrees = hourlyTrend.direction === direction || hourlyTrend.direction === "sideways";

  const nearFan = gann.fanLines.length > 0 && gann.fanLines[0].distancePct <= 1.5;
  const nearS9 = gann.squareOf9.length > 0 && gann.squareOf9[0].distancePct <= 1.0;

  const patternValid = pattern !== null && pattern.direction === direction;

  const cleanRR =
    levels !== null &&
    levels.rewardToRiskTp1 >= 2 &&
    levels.stopPctOfPrice >= 12 &&
    levels.stopPctOfPrice <= 18;

  const breakdown: ScoreBreakdownItem[] = [
    {
      criterion: "Macro trend context (10yr/5yr/1yr)",
      passed: macroExtended,
      note: macroExtended
        ? `Extended ${opposite} move into the level — primed for ${direction} reversion.`
        : "Macro timeframes are not extended against the setup direction.",
    },
    {
      criterion: "1-hour trend agreement",
      passed: hourlyAgrees,
      note: `1hr trend reads ${hourlyTrend.direction}.`,
    },
    {
      criterion: "Gann fan angle proximity",
      passed: nearFan,
      note: nearFan
        ? `Price within ${gann.fanLines[0].distancePct.toFixed(2)}% of the ${gann.fanLines[0].angle} fan line at ${gann.fanLines[0].price.toFixed(2)}.`
        : "No Gann fan line within 1.5%.",
    },
    {
      criterion: "Square of 9 level proximity",
      passed: nearS9,
      note: nearS9
        ? `Price within ${gann.squareOf9[0].distancePct.toFixed(2)}% of the ${gann.squareOf9[0].degree}° coordinate at ${gann.squareOf9[0].price.toFixed(2)}.`
        : "No Square-of-9 coordinate within 1%.",
    },
    {
      criterion: "Historical support/resistance",
      passed: nearSupportResistance,
      note: nearSupportResistance
        ? "Price sits at a clustered macro S/R level."
        : "Not at a significant historical S/R level.",
    },
    {
      criterion: "Strat pattern armed",
      passed: patternValid,
      note: patternValid
        ? `${pattern!.name} ${pattern!.direction} armed — trigger ${pattern!.triggerPrice.toFixed(2)}.`
        : "No matching Strat pattern armed on the execution timeframe.",
    },
    {
      criterion: "Momentum / volatility elevated",
      passed: momentumElevated,
      note: momentumElevated
        ? "Range expansion above average — high-velocity conditions."
        : "Volatility is below the threshold for a high-velocity reversion.",
    },
    {
      criterion: "No earnings in the weekly cycle",
      passed: earningsSoon === false,
      note:
        earningsSoon === null
          ? "Earnings calendar unavailable — no point awarded."
          : earningsSoon
            ? "Earnings scheduled within the weekly options cycle — excluded per protocol."
            : "No earnings within the upcoming weekly cycle.",
    },
    {
      criterion: "Clean risk-reward (TP1 ≥ 2R, stop in 12–18% band)",
      passed: cleanRR,
      note: levels
        ? `TP1 at ${levels.rewardToRiskTp1.toFixed(1)}R; stop is ${levels.stopPctOfPrice.toFixed(1)}% of price.`
        : "No trade levels computed.",
    },
  ];

  const score = breakdown.filter((b) => b.passed).length;
  const outputState: ScanDecision["outputState"] =
    score >= 7 ? "Execute" : score >= 4 ? "Watch" : "Reject";

  return { score, outputState, breakdown };
}

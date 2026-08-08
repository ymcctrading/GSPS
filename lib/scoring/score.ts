/**
 * The Score out of 9 — one point per confirmed confluence condition.
 * 7–9 Execute · 4–6 Watch · 0–3 Reject.
 */

import type {
  GannLevels,
  ScanDecision,
  ScoreBreakdownItem,
  SetupKind,
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
  levels: TradeLevels | null;
  /** Defaults to "reversion" — the protocol's primary setup. */
  setupKind?: SetupKind;
  /** Ratio of recent volume to baseline volume (e.g., 1.2 = 20% above avg). */
  volumeRatio?: number;
}

export function computeScore(inputs: ScoreInputs): ScanDecision {
  const {
    direction, macroTrends, hourlyTrend, gann,
    nearSupportResistance, pattern, momentumElevated, levels,
    setupKind = "reversion",
    volumeRatio = 1.0,
  } = inputs;

  // The macro criterion is the one place the two setup kinds read the same
  // evidence in opposite directions. A reversion wants an extended move
  // AGAINST it (price stretched into the level it will bounce off); a
  // continuation wants the macro running WITH it (a trend still intact).
  // Scoring a continuation on the reversion question would fail it for the
  // very condition that makes it a continuation.
  const opposite = direction === "bullish" ? "bearish" : "bullish";
  const macroWanted = setupKind === "continuation" ? direction : opposite;
  const macroSupports = macroTrends.filter((t) => t.direction === macroWanted).length >= 2;

  const hourlyAgrees = hourlyTrend.direction === direction || hourlyTrend.direction === "sideways";

  const nearFan = gann.fanLines.length > 0 && gann.fanLines[0].distancePct <= 1.5;
  const nearS9 = gann.squareOf9.length > 0 && gann.squareOf9[0].distancePct <= 1.0;

  const patternValid = pattern !== null && pattern.direction === direction;

  const cleanRR = levels !== null && levels.rewardToRiskTp1 >= 2;

  const upcomingCycles = gann.timeCycleDates.slice(0, 3).join(", ");

  // Low-volume stocks are acceptable only if volatility is elevated.
  const adequateLiquidity = volumeRatio >= 1.0 || momentumElevated;

  const breakdown: ScoreBreakdownItem[] = [
    {
      criterion: "Macro trend context (10yr/5yr/1yr)",
      passed: macroSupports,
      note: macroSupports
        ? setupKind === "continuation"
          ? `Macro timeframes read ${direction} — the trend this setup continues is intact.`
          : `Extended ${opposite} move into the level — primed for ${direction} reversion.`
        : setupKind === "continuation"
          ? "Macro timeframes do not confirm the trend this setup would continue."
          : "Macro timeframes are not extended against the setup direction.",
    },
    {
      criterion: "1-hour trend agreement",
      passed: hourlyAgrees,
      note: `1hr trend reads ${hourlyTrend.direction}.`,
    },
    {
      criterion: "Support line proximity",
      passed: nearFan,
      note: nearFan
        ? `Price within ${gann.fanLines[0].distancePct.toFixed(2)}% of the ${gann.fanLines[0].angle} support line at ${gann.fanLines[0].price.toFixed(2)}.`
        : "No support line within 1.5%.",
    },
    {
      criterion: "Harmonic level proximity",
      passed: nearS9,
      note: nearS9
        ? `Price within ${gann.squareOf9[0].distancePct.toFixed(2)}% of the ${gann.squareOf9[0].degree}° harmonic level at ${gann.squareOf9[0].price.toFixed(2)}.`
        : "No harmonic level within 1%.",
    },
    {
      criterion: "Historical support/resistance",
      passed: nearSupportResistance,
      note: nearSupportResistance
        ? "Price sits at a clustered macro S/R level."
        : "Not at a significant historical S/R level.",
    },
    {
      // The criterion is "a pattern armed in the setup's own direction", which
      // is a reversal for a reversion and a continuation for a continuation.
      // Labelling a 2-1-2 that carries a trend "Reversal pattern armed" would
      // describe the opposite trade.
      criterion: `${setupKind === "continuation" ? "Continuation" : "Reversal"} pattern armed`,
      passed: patternValid,
      note: patternValid
        ? `${pattern!.name} ${pattern!.direction} armed — trigger ${pattern!.triggerPrice.toFixed(2)}.`
        : `No matching ${setupKind === "continuation" ? "continuation" : "reversal"} pattern armed on the execution timeframe.`,
    },
    {
      criterion: "Momentum / volatility elevated",
      passed: momentumElevated,
      note: momentumElevated
        ? "Range expansion above average — high-velocity conditions."
        : "Volatility is below the threshold for a high-velocity reversion.",
    },
    {
      criterion: "Cyclical turn window active",
      passed: gann.timeCycleActive,
      note: gann.timeCycleActive
        ? `Scan date falls inside a projected turn window${upcomingCycles ? ` — next dates of interest ${upcomingCycles}.` : "."}`
        : `Not inside a projected turn window${upcomingCycles ? `; next dates of interest ${upcomingCycles}.` : " — none projected in the next two weeks."}`,
    },
    {
      criterion: "Clean risk-reward (TP1 ≥ 2R)",
      passed: cleanRR,
      note: levels
        ? `TP1 at ${levels.rewardToRiskTp1.toFixed(1)}R.`
        : "No trade levels computed.",
    },
  ];

  const score = breakdown.filter((b) => b.passed).length;

  // "Execute" is an instruction to place an order, so it requires an order to
  // place. Seven of the nine criteria are context — macro, structure, cycles —
  // and can all pass with no armed pattern and no priced trade plan, which is
  // exactly the 7/9 that would otherwise read as Execute with no entry, stop or
  // targets. Without a plan the strongest honest reading is Watch.
  const tradePlanReady = patternValid && levels !== null;
  if (score >= 7 && !tradePlanReady) {
    breakdown.push({
      criterion: "Trade plan priced (entry / stop / TP1 / master)",
      passed: false,
      note: levels
        ? "No armed pattern in the setup direction — nothing to enter against, so the state is held at Watch."
        : "No trade plan computed — no entry, stop or targets to act on, so the state is held at Watch.",
    });
  }

  // Liquidity is a hard gate — reject low-volume setups without elevated volatility
  // before considering the score. Report why in a breakdown item.
  if (!adequateLiquidity) {
    breakdown.unshift({
      criterion: "Adequate liquidity (volume or volatility)",
      passed: false,
      note:
        volumeRatio < 1.0 && !momentumElevated
          ? `Low volume (${(volumeRatio * 100).toFixed(0)}% of avg) without elevated volatility — insufficient trading conditions.`
          : `Rejected due to insufficient liquidity.`,
    });
    return {
      score: 0,
      outputState: "Reject",
      breakdown,
    };
  }

  const outputState: ScanDecision["outputState"] =
    score >= 7 && tradePlanReady ? "Execute" : score >= 4 ? "Watch" : "Reject";

  return { score, outputState, breakdown };
}

/**
 * A bare "2-2" reversal (unsharpened by a prior inside/outside bar) is only
 * an actionable reversion call when both momentum/volatility and a
 * historical support/resistance level confirm it. Without both, it must be
 * downgraded to "Watch" regardless of score — never shown as a trade signal.
 */
export function applyReversionConfirmation(
  decision: ScanDecision,
  pattern: StratPattern | null,
  momentumElevated: boolean,
  nearSupportResistance: boolean,
): ScanDecision {
  const isBareReversal = pattern?.name === "2-2";
  const confirmed = momentumElevated && nearSupportResistance;
  if (!isBareReversal || confirmed || decision.outputState !== "Execute") {
    return decision;
  }

  return {
    ...decision,
    outputState: "Watch",
    breakdown: [
      ...decision.breakdown,
      {
        criterion: "Reversion confirmation (bare 2-2 needs momentum + S/R)",
        passed: false,
        note: "Bare 2-2 reversal without both momentum/volatility and support/resistance confirmation — downgraded from Execute to Watch.",
      },
    ],
  };
}

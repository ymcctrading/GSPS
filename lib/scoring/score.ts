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
import {
  FALLBACK_FAN_PCT,
  FALLBACK_HARMONIC_PCT,
  FAN_PROXIMITY_ATR,
  HARMONIC_PROXIMITY_ATR,
  bandBasis,
  proximityBandPct,
} from "@/lib/scoring/proximity";
import {
  DEFAULT_CRITERION_WEIGHTS,
  type CriterionKey,
  type CriterionWeights,
} from "@/lib/scoring/weights";
import type { DecisionLag } from "@/lib/data/latency";

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
  /**
   * Daily ATR as a percentage of price. The structural proximity criteria are
   * measured in multiples of it, so "near a level" means the same fraction of a
   * day's range on every instrument — see lib/scoring/proximity.ts. Omitted
   * means no volatility read is available and the old fixed bands apply.
   */
  atrPct?: number;
  /**
   * Per-criterion weights, keyed by the stable id each breakdown item carries
   * rather than its display text, so rewording a criterion cannot detach its
   * weight. Defaults to one point each, which is what the score has always been. A
   * weight set from `lib/backtest/propose-weights.ts` sums to the same 9 points,
   * so the Execute/Watch cutoffs keep their meaning.
   */
  weights?: CriterionWeights;
}

export function computeScore(inputs: ScoreInputs): ScanDecision {
  const {
    direction, macroTrends, hourlyTrend, gann,
    nearSupportResistance, pattern, momentumElevated, levels,
    setupKind = "reversion",
    volumeRatio = 1.0,
    atrPct,
    weights = DEFAULT_CRITERION_WEIGHTS,
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

  // "Near a level" is a multiple of the instrument's own daily range, not a
  // fixed percentage of price — see lib/scoring/proximity.ts for why a fixed
  // band made a 7/9 mean different things on different names.
  const fanBandPct = proximityBandPct(FAN_PROXIMITY_ATR, FALLBACK_FAN_PCT, atrPct);
  const harmonicBandPct = proximityBandPct(
    HARMONIC_PROXIMITY_ATR,
    FALLBACK_HARMONIC_PCT,
    atrPct,
  );
  const nearFan = gann.fanLines.length > 0 && gann.fanLines[0].distancePct <= fanBandPct;
  const nearS9 = gann.squareOf9.length > 0 && gann.squareOf9[0].distancePct <= harmonicBandPct;

  const patternValid = pattern !== null && pattern.direction === direction;

  // "TP1 ≥ 2R" could never fail, and so was never a criterion. computeTradeLevels
  // sets TP1 to max(2R, previous candle's extreme), which puts the ratio at 2 or
  // better on every well-formed pattern — a free point on all nine-criteria
  // scores, inflating every verdict by one and discriminating nothing.
  //
  // Scoring TP1's structural branch instead is no better: it is unreachable in
  // practice (zero of 6,362 armed setups) and only mirrors the defect, turning
  // a point nobody could lose into one nobody could win.
  //
  // The master target is where structure actually shows up. It snaps to a Gann
  // or harmonic level when one sits in range and falls back to a plain 3R
  // projection when none does — roughly a 29/71 split, so both arms carry
  // enough trades to separate a winner from a loser.
  const cleanRR = levels !== null && levels.masterFromStructure;

  const upcomingCycles = gann.timeCycleDates.slice(0, 3).join(", ");

  // Low-volume stocks are acceptable only if volatility is elevated.
  const adequateLiquidity = volumeRatio >= 1.0 || momentumElevated;

  const breakdown: ScoreBreakdownItem[] = [
    {
      key: "macroTrend",
      criterion: "Macro trend context (10yr/5yr/1yr)",
      pillar: "trend",
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
      key: "hourlyTrend",
      criterion: "1-hour trend agreement",
      pillar: "trend",
      passed: hourlyAgrees,
      note: `1hr trend reads ${hourlyTrend.direction}.`,
    },
    {
      key: "fanProximity",
      criterion: "Support line proximity",
      pillar: "structure",
      passed: nearFan,
      note: nearFan
        ? `Price within ${gann.fanLines[0].distancePct.toFixed(2)}% of the ${gann.fanLines[0].angle} support line at ${gann.fanLines[0].price.toFixed(2)} — inside the ${fanBandPct.toFixed(2)}% band (${bandBasis(FAN_PROXIMITY_ATR, atrPct)}).`
        : `No support line within ${fanBandPct.toFixed(2)}% (${bandBasis(FAN_PROXIMITY_ATR, atrPct)}).`,
    },
    {
      key: "harmonicProximity",
      criterion: "Harmonic level proximity",
      pillar: "structure",
      passed: nearS9,
      note: nearS9
        ? `Price within ${gann.squareOf9[0].distancePct.toFixed(2)}% of the ${gann.squareOf9[0].degree}° harmonic level at ${gann.squareOf9[0].price.toFixed(2)} — inside the ${harmonicBandPct.toFixed(2)}% band (${bandBasis(HARMONIC_PROXIMITY_ATR, atrPct)}).`
        : `No harmonic level within ${harmonicBandPct.toFixed(2)}% (${bandBasis(HARMONIC_PROXIMITY_ATR, atrPct)}).`,
    },
    {
      key: "historicalSR",
      criterion: "Historical support/resistance",
      pillar: "structure",
      passed: nearSupportResistance,
      note: nearSupportResistance
        ? "Price sits at a clustered macro S/R level."
        : "Not at a significant historical S/R level.",
    },
    {
      key: "patternArmed",
      // The criterion is "a pattern armed in the setup's own direction", which
      // is a reversal for a reversion and a continuation for a continuation.
      // Labelling a 2-1-2 that carries a trend "Reversal pattern armed" would
      // describe the opposite trade.
      criterion: `${setupKind === "continuation" ? "Continuation" : "Reversal"} pattern armed`,
      pillar: "setup",
      passed: patternValid,
      note: patternValid
        ? `${pattern!.name} ${pattern!.direction} armed — trigger ${pattern!.triggerPrice.toFixed(2)}.`
        : `No matching ${setupKind === "continuation" ? "continuation" : "reversal"} pattern armed on the execution timeframe.`,
    },
    {
      key: "momentum",
      criterion: "Momentum / volatility elevated",
      pillar: "setup",
      passed: momentumElevated,
      note: momentumElevated
        ? "Range expansion above average — high-velocity conditions."
        : "Volatility is below the threshold for a high-velocity reversion.",
    },
    {
      key: "timeCycle",
      criterion: "Cyclical turn window active",
      pillar: "timing",
      passed: gann.timeCycleActive,
      note: gann.timeCycleActive
        ? `Scan date falls inside a projected turn window${upcomingCycles ? ` — next dates of interest ${upcomingCycles}.` : "."}`
        : `Not inside a projected turn window${upcomingCycles ? `; next dates of interest ${upcomingCycles}.` : " — none projected in the next two weeks."}`,
    },
    {
      key: "masterStructural",
      criterion: "Master target confirmed by a structural level",
      pillar: "riskReward",
      passed: cleanRR,
      note: !levels
        ? "No trade levels computed."
        : cleanRR
          ? `Master profit at ${levels.masterProfit.toFixed(2)} (${levels.rewardToRiskMaster.toFixed(1)}R) sits on a support or harmonic level, not just a projection from risk.`
          : `Master profit at ${levels.masterProfit.toFixed(2)} (${levels.rewardToRiskMaster.toFixed(1)}R) is projected from risk — no support or harmonic level in range to confirm it.`,
    },
  ];

  // Points, not criteria met: every criterion is worth one point under the
  // default weights, so this is the same integer it has always been, and a
  // weight set from the attribution study redistributes the same nine points
  // without moving the Execute/Watch cutoffs. Rounded to two decimals because
  // the difference between 6.999 and 7 is float dirt, not a verdict.
  const score =
    Math.round(
      breakdown
        .filter((b) => b.passed && b.pillar !== undefined)
        .reduce((sum, b) => sum + (weights[b.key as CriterionKey] ?? 1), 0) * 100,
    ) / 100;

  // "Execute" is an instruction to place an order, so it requires an order to
  // place. Seven of the nine criteria are context — macro, structure, cycles —
  // and can all pass with no armed pattern and no priced trade plan, which is
  // exactly the 7/9 that would otherwise read as Execute with no entry, stop or
  // targets. Without a plan the strongest honest reading is Watch.
  const tradePlanReady = patternValid && levels !== null;
  if (score >= 7 && !tradePlanReady) {
    breakdown.push({
      key: "tradePlanPriced",
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
      key: "liquidity",
      criterion: "Adequate liquidity (volume or volatility)",
      passed: false,
      note:
        volumeRatio < 1.0 && !momentumElevated
          ? `Low volume (${(volumeRatio * 100).toFixed(0)}% of avg) without elevated volatility — insufficient trading conditions.`
          : `Rejected due to insufficient liquidity.`,
    });
    return {
      // The gate decides the verdict, not the score. Zeroing it here would
      // contradict the breakdown sitting right beside it — every criterion the
      // setup genuinely passed is still listed — and `scan_events.score`
      // persists this number, so an 8/9 setup rejected on liquidity would enter
      // the learning data as a 0/9 one. The invariant that `score` is the points
      // earned by the criteria that passed — one each by default — is what makes
      // the factor attribution in lib/backtest/attribution.ts trustworthy; the
      // liquidity item carries no pillar and no points, so it holds.
      score,
      outputState: "Reject",
      breakdown,
    };
  }

  const outputState: ScanDecision["outputState"] =
    score >= 7 && tradePlanReady ? "Execute" : score >= 4 ? "Watch" : "Reject";

  return { score, outputState, breakdown };
}

/**
 * Hold Execute when the data the verdict was computed on is a whole execution
 * bar or more behind the market.
 *
 * "Execute" is an instruction to place an order at a named trigger price. On a
 * feed delayed by a full bar, that price belongs to a candle that has already
 * closed — the move it was arming for either happened without us or did not
 * happen at all, and there is no way to tell which from the data in hand. Watch
 * is the strongest honest reading, and the note says so in the same voice as the
 * other holds.
 *
 * The score itself is untouched: the analysis was sound, the data was late.
 * Only the instruction to act on it is withdrawn.
 */
export function applyDataLagHold(decision: ScanDecision, lag: DecisionLag): ScanDecision {
  if (!lag.holdsExecute || decision.outputState !== "Execute") return decision;

  return {
    ...decision,
    outputState: "Watch",
    breakdown: [
      ...decision.breakdown,
      {
        key: "dataLag",
        criterion: "Data current enough to act on",
        passed: false,
        note: `${lag.note} Held from Execute to Watch — confirm the trigger against a live quote before acting.`,
      },
    ],
  };
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
        key: "reversionConfirmation",
        criterion: "Reversion confirmation (bare 2-2 needs momentum + S/R)",
        passed: false,
        note: "Bare 2-2 reversal without both momentum/volatility and support/resistance confirmation — downgraded from Execute to Watch.",
      },
    ],
  };
}

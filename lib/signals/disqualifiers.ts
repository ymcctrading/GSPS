/**
 * Required disqualifiers, shared across all four scanner states. Any one of
 * these firing blocks the signal outright, regardless of Rules Alignment
 * Score — these are hard gates, not scored criteria.
 */

import type { SignalDisqualifier, SignalGates } from "./types";

export function evaluateDisqualifiers(gates: SignalGates): SignalDisqualifier[] {
  const disqualifiers: SignalDisqualifier[] = [];

  if (!gates.operatingCandleClosed) {
    disqualifiers.push({
      key: "unclosedCandle",
      reason: "Operating-timeframe candle has not closed — no look-ahead scoring.",
    });
  }
  if (gates.staleData) {
    disqualifiers.push({ key: "staleData", reason: "Market data is stale." });
  }
  if (gates.binaryEventInHoldPeriod !== false) {
    // null (unknown) and true both block, per "unknown event data defaults to caution/block".
    disqualifiers.push({
      key: "binaryEvent",
      reason:
        gates.binaryEventInHoldPeriod === null
          ? "Binary-event status is unknown for the expected hold period — defaults to block."
          : "Earnings or another defined binary event falls inside the expected Novice hold period.",
    });
  }
  if (!gates.targetRoomAvailable) {
    disqualifiers.push({
      key: "targetBlocked",
      reason: "Target is blocked by credible resistance before the minimum required reward path.",
    });
  }
  if (!gates.stopWithinNovicePolicy) {
    disqualifiers.push({
      key: "stopPolicy",
      reason: "Required stop exceeds the Novice maximum policy.",
    });
  }
  if (!gates.positionSizeAvailable) {
    disqualifiers.push({
      key: "positionSize",
      reason: "Position size is unavailable within buying-power/allocation limits.",
    });
  }
  if (!gates.correlationConcentrationPass) {
    disqualifiers.push({
      key: "correlationConcentration",
      reason: "Correlation/concentration limit failed.",
    });
  }
  if (!gates.cooldownPass) {
    disqualifiers.push({ key: "cooldown", reason: "Cooldown period is active." });
  }
  if (!gates.totalOpenRiskPass) {
    disqualifiers.push({ key: "totalOpenRisk", reason: "Total open-risk limit failed." });
  }
  if (!gates.dataQualityOk) {
    disqualifiers.push({
      key: "dataQuality",
      reason: "Signal was generated from non-adjusted/incorrect data or an unsupported session condition.",
    });
  }
  if (!gates.eligibleUniverse) {
    disqualifiers.push({
      key: "eligibleUniverse",
      reason: "Instrument is not in the eligible universe.",
    });
  }

  return disqualifiers;
}

/** The subset of gates the Rules Alignment tier bands treat as "safety gates" (§ Scoring: 75–84 needs "all safety gates pass"). */
export function allSafetyGatesPass(gates: SignalGates): boolean {
  return (
    gates.liquiditySpreadPass &&
    gates.benchmarkSectorAlignment &&
    gates.targetRoomAvailable &&
    gates.stopWithinNovicePolicy &&
    gates.positionSizeAvailable &&
    gates.correlationConcentrationPass &&
    gates.cooldownPass &&
    gates.totalOpenRiskPass &&
    gates.dataQualityOk &&
    gates.binaryEventInHoldPeriod === false
  );
}

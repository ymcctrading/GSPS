/**
 * Entry point for the Signal and Regime Engine. Deliberately does not expose
 * a single combined "buy/sell" verdict — callers evaluate one named state at
 * a time and get that state's own verdict back, per the mandate: "Implement
 * four distinct scanner states. Do not combine them into a single indicator."
 */

export { classifyRegime, type RegimeInputs } from "./regime";
export { evaluateTrendPullback, type TrendPullbackInputs } from "./states/trendPullback";
export { evaluateTrendBreakout, type TrendBreakoutInputs } from "./states/trendBreakout";
export { evaluateConfirmedReversal, evaluateRangeReversion } from "./states/scaffold";
export { computeRulesAlignmentScore, tierQualifies } from "./scoring";
export { evaluateDisqualifiers, allSafetyGatesPass } from "./disqualifiers";
export * from "./types";

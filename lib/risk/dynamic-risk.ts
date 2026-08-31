/**
 * Bounded dynamic-risk policy.
 *
 * permitted_risk = equity * min(absolute_tier_cap, base_rate * setup_multiplier *
 *   execution_multiplier * market_multiplier * correlation_multiplier)
 * permitted_risk = min(permitted_risk, remaining_daily_budget,
 *   remaining_48h_budget, remaining_open_risk_budget)
 *
 * Two invariants the spec calls out explicitly and this module enforces
 * structurally rather than by convention:
 *   - The internal score is never presented as, nor used as, "high likelihood
 *     of profit" — this module returns a risk ceiling in dollars/percent, not
 *     a probability, and callers must not relabel it as one.
 *   - `absolute_tier_cap` is a hard ceiling, applied via `Math.min` before any
 *     of the three budget caps, so no combination of multipliers can cross it.
 */

import {
  ABSOLUTE_TIER_CAP_PCT,
  EXCEPTIONAL_BAND_MIN_TRADES,
  MIN_TRADES_FOR_RISK_INCREASE,
  RISK_BAND_RATE_PCT,
  type RiskBand,
} from "@/lib/risk/config";
import type { CircuitState } from "@/lib/risk/config";

/**
 * The numeric knobs `resolveRiskBand`/`computePermittedRisk` read, isolated
 * so a caller can pass a `policy_values`-resolved override (see
 * lib/risk/policy.ts) without touching this module's other exports.
 * Defaults are the same module-level constants this file always used.
 */
export interface RiskBandThresholds {
  minTradesForRiskIncrease: number;
  exceptionalBandMinTrades: number;
  absoluteTierCapPct: number;
  riskBandRatePct: Record<RiskBand, number>;
}

export const DEFAULT_RISK_BAND_THRESHOLDS: RiskBandThresholds = {
  minTradesForRiskIncrease: MIN_TRADES_FOR_RISK_INCREASE,
  exceptionalBandMinTrades: EXCEPTIONAL_BAND_MIN_TRADES,
  absoluteTierCapPct: ABSOLUTE_TIER_CAP_PCT,
  riskBandRatePct: { ...RISK_BAND_RATE_PCT },
};

export interface RiskBandInputs {
  completedSwingTrades: number;
  executionScore: number; // 0-100
  hasActiveCooldown: boolean;
  /** True if the account has any discipline breach within the recent lookback window the caller defines. */
  hasRepeatedRecentDisciplineBreach: boolean;
  /** True when the trader's history covers a reasonable spread of setups/market conditions, not one repeated pattern. */
  hasVariedConditionsSample: boolean;
  /** True when there are no active caution states (warnings) outstanding. */
  hasNoCautionStates: boolean;
}

/**
 * Which band an account currently qualifies for. This is eligibility, not
 * entitlement — `computePermittedRisk` still applies the setup/execution/
 * market/correlation multipliers and the three rolling budgets on top of
 * whatever band rate this resolves to.
 */
export function resolveRiskBand(
  input: RiskBandInputs,
  thresholds: RiskBandThresholds = DEFAULT_RISK_BAND_THRESHOLDS,
): RiskBand {
  if (input.completedSwingTrades < thresholds.minTradesForRiskIncrease) return "base";
  if (input.hasActiveCooldown) return "base";

  // The spec's "40-50 completed trades" names the sample size that
  // demonstrates a discipline record, not a ceiling that expires eligibility
  // at trade 51 — so this is a floor, using the lower end of the range.
  const exceptionalEligible =
    input.completedSwingTrades >= thresholds.exceptionalBandMinTrades &&
    input.hasVariedConditionsSample &&
    input.hasNoCautionStates &&
    !input.hasRepeatedRecentDisciplineBreach;

  if (exceptionalEligible && input.executionScore >= 90) return "exceptional_a_plus";
  if (input.executionScore >= 80 && !input.hasRepeatedRecentDisciplineBreach) return "a_plus";
  if (input.executionScore >= 65) return "a_tier";
  return "base";
}

export interface Multipliers {
  /** Strength/rules-alignment of this specific setup. 1.0 = standard qualified setup. */
  setup: number;
  /** Derived from the user execution score — see lib/risk/execution-score.ts. */
  execution: number;
  /** Derived from current market/volatility conditions. */
  market: number;
  /** Reduces risk as correlated/stacked exposure increases; 1.0 = no correlated exposure. */
  correlation: number;
}

export interface RemainingBudgets {
  /** Dollars left under the account's total planned-open-risk budget for the day. */
  remainingDailyBudget: number;
  /** Dollars left before the 48h loss threshold gates further new risk. */
  remaining48hBudget: number;
  /** Dollars left under the max-total-planned-open-risk ceiling across all open positions. */
  remainingOpenRiskBudget: number;
}

export interface PermittedRiskInputs {
  equity: number;
  band: RiskBand;
  multipliers: Multipliers;
  budgets: RemainingBudgets;
  /** Current circuit-breaker state — a non-"normal"/"warning" state forces the ceiling to zero. */
  circuitState: CircuitState;
}

export interface PermittedRisk {
  /** Dollars a new trade may risk right now. Never negative. */
  permittedRiskUsd: number;
  /** The same figure as a percent of equity, for display against the band table. */
  permittedRiskPct: number;
  /** Which cap actually bound the result — for the "why this number" panel and the audit record. */
  boundBy: "absolute_tier_cap" | "band_rate" | "daily_budget" | "48h_budget" | "open_risk_budget" | "circuit_breaker";
}

export function computePermittedRisk(
  input: PermittedRiskInputs,
  thresholds: RiskBandThresholds = DEFAULT_RISK_BAND_THRESHOLDS,
): PermittedRisk {
  if (input.circuitState !== "normal" && input.circuitState !== "warning") {
    return { permittedRiskUsd: 0, permittedRiskPct: 0, boundBy: "circuit_breaker" };
  }
  if (!(input.equity > 0)) {
    return { permittedRiskUsd: 0, permittedRiskPct: 0, boundBy: "band_rate" };
  }

  const baseRatePct = thresholds.riskBandRatePct[input.band];
  const { setup, execution, market, correlation } = input.multipliers;
  const composedPct = baseRatePct * setup * execution * market * correlation;
  const cappedPct = Math.min(thresholds.absoluteTierCapPct, composedPct);
  const boundByCap = cappedPct === thresholds.absoluteTierCapPct && composedPct > thresholds.absoluteTierCapPct;

  const fromRate = input.equity * (cappedPct / 100);

  const candidates: [number, PermittedRisk["boundBy"]][] = [
    [Math.max(fromRate, 0), boundByCap ? "absolute_tier_cap" : "band_rate"],
    [Math.max(input.budgets.remainingDailyBudget, 0), "daily_budget"],
    [Math.max(input.budgets.remaining48hBudget, 0), "48h_budget"],
    [Math.max(input.budgets.remainingOpenRiskBudget, 0), "open_risk_budget"],
  ];

  let [winnerUsd, winnerBy] = candidates[0];
  for (const [usd, by] of candidates.slice(1)) {
    if (usd < winnerUsd) [winnerUsd, winnerBy] = [usd, by];
  }

  return {
    permittedRiskUsd: winnerUsd,
    permittedRiskPct: input.equity > 0 ? (winnerUsd / input.equity) * 100 : 0,
    boundBy: winnerBy,
  };
}

/** floor(permitted_risk_dollars / |entry - stop|), respecting fractional-share support. */
export function quantityFromPermittedRisk(
  permittedRiskUsd: number,
  entryPrice: number,
  stopPrice: number,
  fractionalSharesSupported: boolean,
): number {
  const perShareRisk = Math.abs(entryPrice - stopPrice);
  if (!(perShareRisk > 0) || !(permittedRiskUsd > 0)) return 0;
  const raw = permittedRiskUsd / perShareRisk;
  return fractionalSharesSupported ? Math.floor(raw * 1e6) / 1e6 : Math.floor(raw);
}

export function plannedRiskDollars(entryPrice: number, stopPrice: number, quantity: number): number {
  return Math.abs(entryPrice - stopPrice) * quantity;
}

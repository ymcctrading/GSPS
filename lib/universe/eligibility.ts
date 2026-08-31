/**
 * `novice_eligible` and `trade_qualified` — the exact boolean formulas from
 * the spec, as a pure composition of the filters in this directory. See
 * `lib/universe/types.ts` for the formulas themselves and how this layer
 * relates to the existing Signal and Regime Engine / Guided eligibility.
 */

import { checkProhibited } from "./prohibited";
import { marketCapPass, DEFAULT_MARKET_CAP_THRESHOLDS, type MarketCapThresholds } from "./marketCap";
import { liquidityPass, DEFAULT_LIQUIDITY_THRESHOLDS, type LiquidityThresholds } from "./liquidity";
import { priceOrFractionalPass, DEFAULT_PRICE_BAND_THRESHOLDS, type PriceBandThresholds } from "./priceAccessibility";
import { spreadPass, DEFAULT_SPREAD_THRESHOLDS, type SpreadQuote, type SpreadThresholds } from "./spread";
import { eventRiskPass } from "./eventRisk";
import { volatilityPass, DEFAULT_VOLATILITY_THRESHOLDS, type VolatilityThresholds } from "./volatility";
import { dataQualityPass, DEFAULT_DATA_QUALITY_THRESHOLDS, type DataQualityInputs, type DataQualityThresholds } from "./dataQuality";
import type { Bar } from "@/lib/types";
import type { NoviceEligibility, TradeQualification, TriState, UniverseFilterResult } from "./types";

/**
 * Every `policy_values`-overridable threshold `assessNoviceEligibility`'s
 * filters read, bundled so a caller can pass one `getUniversePolicy()`
 * result through instead of five separate parameters — see
 * lib/universe/policy.ts. Defaults are each filter's own module-level
 * constants, so every existing call site is unaffected.
 */
export interface UniverseThresholds {
  marketCap: MarketCapThresholds;
  liquidity: LiquidityThresholds;
  priceBand: PriceBandThresholds;
  spread: SpreadThresholds;
  volatility: VolatilityThresholds;
  dataQuality: DataQualityThresholds;
}

export const DEFAULT_UNIVERSE_THRESHOLDS: UniverseThresholds = {
  marketCap: DEFAULT_MARKET_CAP_THRESHOLDS,
  liquidity: DEFAULT_LIQUIDITY_THRESHOLDS,
  priceBand: DEFAULT_PRICE_BAND_THRESHOLDS,
  spread: DEFAULT_SPREAD_THRESHOLDS,
  volatility: DEFAULT_VOLATILITY_THRESHOLDS,
  dataQuality: DEFAULT_DATA_QUALITY_THRESHOLDS,
};

export interface NoviceEligibilityInputs {
  symbol: string;
  /**
   * Ignored when `marketCapResult` is supplied. Kept as the default path for
   * any future caller that has a real numeric market-cap read — see
   * `lib/universe/scanGates.ts` for the one caller that doesn't and supplies
   * `marketCapResult` from `marketCapPassFromLargeCapCoverage` instead.
   */
  marketCapUsd: number | null;
  /** Pre-computed `market_cap_pass`, for a caller whose only real signal is coverage rather than a number. Overrides `marketCapUsd` when set. */
  marketCapResult?: UniverseFilterResult;
  avgDailyDollarVolume: number | null;
  price: number | null;
  fractionalConfirmed: boolean | null;
  spreadQuote: SpreadQuote | null;
  binaryEventInHoldWindow: TriState;
  dailyBars: Bar[];
  dataQuality: DataQualityInputs;
}

/**
 * `novice_eligible = market_cap_pass AND liquidity_pass AND
 * price_or_fractional_pass AND spread_pass AND event_risk_pass AND
 * volatility_pass AND data_quality_pass`.
 *
 * The prohibited/conditional check runs first and, if it fires, short-circuits
 * the rest: a leveraged/inverse product is never eligible regardless of how
 * every other filter reads, and there is no reason to spend the volatility/
 * data-quality reads on a symbol already excluded by class.
 */
export function assessNoviceEligibility(
  inputs: NoviceEligibilityInputs,
  thresholds: UniverseThresholds = DEFAULT_UNIVERSE_THRESHOLDS,
): NoviceEligibility {
  const prohibited = checkProhibited(inputs.symbol);
  if (prohibited.prohibited) {
    const filters: UniverseFilterResult[] = [
      { key: "prohibited_class", pass: false, reason: prohibited.reason },
    ];
    return { eligible: false, filters, reasons: [prohibited.reason!] };
  }

  const liquidity = liquidityPass(inputs.avgDailyDollarVolume, thresholds.liquidity);

  const filters: UniverseFilterResult[] = [
    inputs.marketCapResult ?? marketCapPass(inputs.marketCapUsd, thresholds.marketCap),
    liquidity,
    priceOrFractionalPass(inputs.price, inputs.fractionalConfirmed, thresholds.priceBand),
    spreadPass(inputs.spreadQuote, liquidity.pass, thresholds.spread),
    eventRiskPass(inputs.binaryEventInHoldWindow),
    volatilityPass(inputs.dailyBars, 14, thresholds.volatility),
    dataQualityPass(inputs.dataQuality, thresholds.dataQuality),
  ];

  const reasons = filters.filter((f) => !f.pass).map((f) => f.reason!).filter((r): r is string => r !== null);
  return { eligible: reasons.length === 0, filters, reasons };
}

export interface TradeQualificationInputs {
  noviceEligibility: NoviceEligibility;
  /** Already-computed regime read — see `lib/signals/regime.ts`. */
  regimePass: boolean;
  /** Already-computed confirmation read for the scanner state in play — see `lib/signals` state modules. */
  confirmationPass: boolean;
  /** Whether a priced plan can actually reach its target — see `SignalGates.targetRoomAvailable`. */
  targetPathPass: boolean;
  /** Already-computed account-risk read — see `lib/risk` and `lib/universe/smallAccount.ts`. */
  accountRiskPass: boolean;
}

/**
 * `trade_qualified = novice_eligible AND regime_pass AND confirmation_pass
 * AND target_path_pass AND account_risk_pass`.
 *
 * Deliberately does not compute regime/confirmation/target-path/account-risk
 * itself — those already exist as their own, independently maintained
 * engines. This function's only job is the final AND, so it cannot drift
 * from whichever of those engines a caller is using.
 */
export function assessTradeQualification(inputs: TradeQualificationInputs): TradeQualification {
  const { noviceEligibility, regimePass, confirmationPass, targetPathPass, accountRiskPass } = inputs;
  const reasons = [...noviceEligibility.reasons];
  if (!regimePass) reasons.push("Regime does not support this setup.");
  if (!confirmationPass) reasons.push("Confirmation criteria not met.");
  if (!targetPathPass) reasons.push("Target path is not available.");
  if (!accountRiskPass) reasons.push("Account-risk gate failed.");

  return {
    qualified: noviceEligibility.eligible && regimePass && confirmationPass && targetPathPass && accountRiskPass,
    noviceEligible: noviceEligibility,
    regimePass,
    confirmationPass,
    targetPathPass,
    accountRiskPass,
    reasons,
  };
}

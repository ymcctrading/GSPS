/**
 * `novice_eligible` and `trade_qualified` — the exact boolean formulas from
 * the spec, as a pure composition of the filters in this directory. See
 * `lib/universe/types.ts` for the formulas themselves and how this layer
 * relates to the existing Signal and Regime Engine / Guided eligibility.
 */

import { checkProhibited } from "./prohibited";
import { marketCapPass } from "./marketCap";
import { liquidityPass } from "./liquidity";
import { priceOrFractionalPass } from "./priceAccessibility";
import { spreadPass, type SpreadQuote } from "./spread";
import { eventRiskPass } from "./eventRisk";
import { volatilityPass } from "./volatility";
import { dataQualityPass, type DataQualityInputs } from "./dataQuality";
import type { Bar } from "@/lib/types";
import type { NoviceEligibility, TradeQualification, TriState, UniverseFilterResult } from "./types";

export interface NoviceEligibilityInputs {
  symbol: string;
  marketCapUsd: number | null;
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
export function assessNoviceEligibility(inputs: NoviceEligibilityInputs): NoviceEligibility {
  const prohibited = checkProhibited(inputs.symbol);
  if (prohibited.prohibited) {
    const filters: UniverseFilterResult[] = [
      { key: "prohibited_class", pass: false, reason: prohibited.reason },
    ];
    return { eligible: false, filters, reasons: [prohibited.reason!] };
  }

  const liquidity = liquidityPass(inputs.avgDailyDollarVolume);

  const filters: UniverseFilterResult[] = [
    marketCapPass(inputs.marketCapUsd),
    liquidity,
    priceOrFractionalPass(inputs.price, inputs.fractionalConfirmed),
    spreadPass(inputs.spreadQuote, liquidity.pass),
    eventRiskPass(inputs.binaryEventInHoldWindow),
    volatilityPass(inputs.dailyBars),
    dataQualityPass(inputs.dataQuality),
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

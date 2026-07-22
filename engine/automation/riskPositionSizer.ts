/**
 * Leverage & position-sizing engine for futures / commodities.
 *
 *   contracts = floor( (equity * risk%) / (ATR * pointValue) )
 *
 * bounded to [1, 5] to enforce an institutional circuit-breaker on any single
 * automated path. Risk % is driven by the user's risk_profile dial.
 */

export type RiskProfile = "PASSIVE" | "MODERATE" | "AGGRESSIVE";

/** $ value per 1.0 point move, per contract. */
export const CONTRACT_MULTIPLIERS: Record<string, number> = {
  ES: 50.0, // S&P 500 E-mini
  NQ: 20.0, // Nasdaq 100 E-mini
  GC: 100.0, // Gold
  CL: 1000.0, // Crude Oil
};

export const RISK_ALLOCATIONS: Record<RiskProfile, number> = {
  PASSIVE: 0.01, // 1% of equity
  MODERATE: 0.02, // 2%
  AGGRESSIVE: 0.04, // 4%
};

export const MAX_CONTRACTS = 5;

export function calculateFuturesLotSize(params: {
  accountEquity: number;
  riskProfile: RiskProfile;
  ticker: string;
  currentAtr: number;
}): number {
  const { accountEquity, riskProfile, ticker, currentAtr } = params;
  const riskPct = RISK_ALLOCATIONS[riskProfile] ?? RISK_ALLOCATIONS.MODERATE;
  const multiplier = CONTRACT_MULTIPLIERS[ticker.toUpperCase()] ?? 1.0;

  const dollarAtRisk = accountEquity * riskPct;
  const riskPerContract = currentAtr * multiplier;

  if (riskPerContract <= 0) return 0;

  const target = Math.floor(dollarAtRisk / riskPerContract);
  return Math.min(Math.max(target, 1), MAX_CONTRACTS);
}

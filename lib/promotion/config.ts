/**
 * Tier Access, Promotion & User Experience — policy constants.
 *
 * Source: "Tier Access, Promotion & User Experience" spec pack (2026-08-28),
 * the "Promotion readiness model" and "Pro intraday initial policy" tables.
 * These are the code-default values: `lib/promotion/policy.ts` overlays any
 * row from `promotion_policy_values` on top of them, so a threshold can be
 * tuned without a deploy while still having a documented, safe fallback.
 *
 * These are initial product-policy proposals, not derived from live data —
 * the spec pack says so explicitly. Nothing here grants permission to risk
 * more capital; it only gates feature access (see lib/promotion/eligibility.ts's
 * module doc). The Novice risk/cooldown engine in lib/risk/* is independent
 * and cannot be widened or bypassed by anything in this module.
 */

/** Pro (STANDARD) eligibility baseline — "Promotion readiness model". */
export interface PromotionPolicy {
  /** At least this many completed Novice GSPS swing trades (paper). */
  minCompletedTrades: number;
  /** At least this many calendar days of documented GSPS use. */
  minAccountAgeDays: number;
  /** Rolling 30-day Execution Score (0-100) floor. */
  minExecutionScore: number;
  /** Stop-adherence ratio floor, 0-1 (spec: 90%+). */
  minStopAdherenceRatio: number;
  /** Position-size-compliance ratio floor, 0-1 (spec: 95%+). */
  minPositionSizeComplianceRatio: number;
  /** No cooldown/lock at or above this circuit-breaker severity in the prior `riskStateLookbackDays`. */
  riskStateLookbackDays: number;
  /** Trailing-window severe-drawdown ceiling used as the paper-trading proxy for "severe cooldown/lock" (percent magnitude). */
  severeDrawdownPct: number;
}

export const DEFAULT_PROMOTION_POLICY: PromotionPolicy = {
  minCompletedTrades: 25,
  minAccountAgeDays: 60,
  minExecutionScore: 80,
  minStopAdherenceRatio: 0.9,
  minPositionSizeComplianceRatio: 0.95,
  riskStateLookbackDays: 30,
  // Reuses the live circuit-breaker's own "critical_lock" threshold
  // (lib/risk/config.ts CRITICAL_LOCK_30D_DRAWDOWN_PCT) as the severity floor
  // a paper account's 30-day drawdown must stay under — see
  // lib/promotion/readiness.ts for why paper trading needs its own proxy
  // rather than reading `risk_circuit_state` directly.
  severeDrawdownPct: 8,
};

/** Pro intraday module boundary — "Pro intraday initial policy" table. Not yet wired to the scanner; see ROADMAP.md. */
export interface ProIntradayPolicy {
  setupsDisplayedPerDayMin: number;
  setupsDisplayedPerDayMax: number;
  newEntriesPerDayDefault: number;
  concurrentPositionsMin: number;
  concurrentPositionsMax: number;
  consecutiveLossPauseCount: number;
  /** Entry confirmation must be on a closed bar of one of these lengths; no unconfirmed intrabar signal. */
  entryConfirmationBarMinutes: readonly [5, 15, 30];
}

export const DEFAULT_PRO_INTRADAY_POLICY: ProIntradayPolicy = {
  setupsDisplayedPerDayMin: 3,
  setupsDisplayedPerDayMax: 5,
  newEntriesPerDayDefault: 2,
  concurrentPositionsMin: 1,
  concurrentPositionsMax: 2,
  consecutiveLossPauseCount: 2,
  entryConfirmationBarMinutes: [5, 15, 30],
};

/** Keys `promotion_policy_values` may override — the only ones `getPromotionPolicy` will read from the database. */
export const PROMOTION_POLICY_KEYS = Object.keys(DEFAULT_PROMOTION_POLICY) as (keyof PromotionPolicy)[];

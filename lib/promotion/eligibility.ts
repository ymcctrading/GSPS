/**
 * Pro (STANDARD) promotion eligibility — pure evaluation.
 *
 * Source: "Tier Access, Promotion & User Experience" spec pack (2026-08-28).
 * This module only compares already-computed inputs against policy
 * thresholds; it never touches Supabase (see `lib/promotion/readiness.ts`
 * for the data-gathering half) and never mutates anything (see
 * `lib/promotion/promote.ts` for that).
 *
 * Deliberately mirrors `lib/entitlements/policy.ts`'s framing: "feature
 * access" (what a Pro account can see/do) is a separate concept from
 * "permission to risk more capital" (the Novice risk/cooldown engine in
 * `lib/risk/*`, which this module never reads or influences). Eligibility
 * here can never be presented as, or used as, a signal that a user should
 * risk more — see `lib/promotion/copy.ts` for the wording rules that keep
 * it that way.
 */

import { DEFAULT_PROMOTION_POLICY, type PromotionPolicy } from "@/lib/promotion/config";

export type PromotionRequirementKey =
  | "experience"
  | "time"
  | "processScore"
  | "stopAdherence"
  | "positionSizeCompliance"
  | "riskState"
  | "education"
  | "practice";

export interface PromotionReadinessInputs {
  /** Completed Novice GSPS (paper) swing trades. */
  completedTrades: number;
  /** Calendar days of documented GSPS use. */
  accountAgeDays: number;
  /** Rolling 30-day Execution Score, 0-100 (lib/risk/execution-score.ts). */
  executionScore: number;
  /** Fraction of qualifying trades that respected their stop, 0-1. */
  stopAdherenceRatio: number;
  /** Fraction of qualifying trades sized within the position-size ceiling, 0-1. */
  positionSizeComplianceRatio: number;
  /** True if a severe cooldown/lock occurred within the policy's lookback window. */
  hadSevereRiskEventRecently: boolean;
  /** Required intraday-risk/settlement/gaps/slippage/account-type education module completed. */
  educationCompleted: boolean;
  /** Required paper-trading/intraday-simulation validation period completed. */
  practiceValidationCompleted: boolean;
}

export interface PromotionRequirementResult {
  key: PromotionRequirementKey;
  met: boolean;
  /** Plain-language label for the readiness checklist UI. */
  label: string;
}

export interface PromotionReadiness {
  eligible: boolean;
  requirements: PromotionRequirementResult[];
}

/**
 * Evaluates every Pro-eligibility requirement independently and returns the
 * full checklist plus an overall verdict. Never short-circuits on the first
 * failure — the UI needs to show a user everything still outstanding, not
 * just the first gap.
 */
export function evaluatePromotionReadiness(
  inputs: PromotionReadinessInputs,
  policy: PromotionPolicy = DEFAULT_PROMOTION_POLICY,
): PromotionReadiness {
  const requirements: PromotionRequirementResult[] = [
    {
      key: "experience",
      met: inputs.completedTrades >= policy.minCompletedTrades,
      label: `At least ${policy.minCompletedTrades} completed Novice GSPS swing trades`,
    },
    {
      key: "time",
      met: inputs.accountAgeDays >= policy.minAccountAgeDays,
      label: `At least ${policy.minAccountAgeDays} calendar days of documented GSPS use`,
    },
    {
      key: "processScore",
      met: inputs.executionScore >= policy.minExecutionScore,
      label: `Rolling 30-day Execution Score of ${policy.minExecutionScore}+`,
    },
    {
      key: "stopAdherence",
      met: inputs.stopAdherenceRatio >= policy.minStopAdherenceRatio,
      label: `Stop adherence of ${Math.round(policy.minStopAdherenceRatio * 100)}%+`,
    },
    {
      key: "positionSizeCompliance",
      met: inputs.positionSizeComplianceRatio >= policy.minPositionSizeComplianceRatio,
      label: `Position-size compliance of ${Math.round(policy.minPositionSizeComplianceRatio * 100)}%+`,
    },
    {
      key: "riskState",
      met: !inputs.hadSevereRiskEventRecently,
      label: `No severe cooldown/lock in the prior ${policy.riskStateLookbackDays} days`,
    },
    {
      key: "education",
      met: inputs.educationCompleted,
      label: "Complete the intraday risk, settlement, gaps, slippage, and account-type module",
    },
    {
      key: "practice",
      met: inputs.practiceValidationCompleted,
      label: "Complete the paper-trading/intraday simulation validation period",
    },
  ];

  return { eligible: requirements.every((r) => r.met), requirements };
}

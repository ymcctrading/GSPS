/**
 * "After close, generate a structured review: plan adherence, actual versus
 * planned entry/exit, rule state, and lesson tags."
 *
 * Three-question mandate (AGENTS.md), applied to the `alignment` field added
 * 2026-09-23:
 * 1. Gann sourcing: N/A — this reflects the Signal & Regime Engine's
 *    already-computed Rules Alignment evidence back to the user; it derives
 *    no new criterion of its own.
 * 2. Dewey/cycle theory: N/A — a single trade's review makes no periodicity
 *    or recurrence claim.
 * 3. Hermetic principle: Cause and Effect, read together with Polarity. This
 *    is the Novice/Pro/Expert-tier counterpart to Wall-Street-only backtest
 *    attribution (`lib/backtest/attribution.ts`) named in AGENTS.md's
 *    Polarity-audit section — deliberately a different kind of tool, not a
 *    diluted copy: one trade's cause (the criteria the Signal & Regime
 *    Engine observed at plan generation) paired with its own effect (how
 *    the plan actually resolved), with no expectancy, win-rate, or profit-
 *    factor claim across trades. Those remain backtesting's own claims.
 */

import type { PlanState, StructuredReview, TradePlan } from "./types";

const RULE_STATE_LESSONS: Partial<Record<PlanState, string>> = {
  closed: "closed_by_rule",
  expired: "trigger_never_occurred",
  invalidated: "stop_or_invalidation_hit",
};

export function buildPostCloseReview(plan: TradePlan): StructuredReview {
  const lessonTags: string[] = [];
  const ruleLesson = RULE_STATE_LESSONS[plan.state];
  if (ruleLesson) lessonTags.push(ruleLesson);

  const entered = plan.actualEntryPrice != null;
  const planAdherence: StructuredReview["planAdherence"] = !entered
    ? "not_entered"
    : withinTolerance(plan)
      ? "followed"
      : "deviated";
  if (planAdherence === "deviated") lessonTags.push("entry_deviated_from_plan");
  if (plan.state === "runner" || plan.state === "master_reached") {
    lessonTags.push("runner_engaged");
  }
  if (plan.masterProfitFloor != null) lessonTags.push("master_profit_floor_protected");

  const summary = buildSummary(plan, planAdherence);

  return {
    planId: plan.planId,
    planAdherence,
    plannedEntry: plan.coordinates.entryTrigger,
    actualEntry: plan.actualEntryPrice,
    plannedStop: plan.coordinates.invalidation,
    plannedTargets: {
      tp1: plan.coordinates.takeProfit1,
      tp2: plan.coordinates.takeProfit2,
      masterProfit: plan.coordinates.masterProfit,
    },
    ruleState: plan.state,
    lessonTags,
    summary,
    alignment: plan.evidence.alignment,
  };
}

function withinTolerance(plan: TradePlan): boolean {
  if (plan.actualEntryPrice == null) return false;
  const tolerance = Math.abs(plan.coordinates.entryLimitTolerance);
  return Math.abs(plan.actualEntryPrice - plan.coordinates.entryTrigger) <= tolerance;
}

function buildSummary(plan: TradePlan, adherence: StructuredReview["planAdherence"]): string {
  if (adherence === "not_entered") {
    return `Plan for ${plan.instrument} never entered (${plan.state}).`;
  }
  const parts = [
    `Entered ${plan.instrument} at ${plan.actualEntryPrice} against a planned trigger of ${plan.coordinates.entryTrigger}.`,
  ];
  if (adherence === "deviated") {
    parts.push("Actual entry fell outside the planned trigger tolerance.");
  }
  parts.push(`Plan closed in state "${plan.state}"${plan.closeReason ? `: ${plan.closeReason}` : "."}`);
  return parts.join(" ");
}

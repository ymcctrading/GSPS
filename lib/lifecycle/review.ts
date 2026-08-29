/**
 * "After close, generate a structured review: plan adherence, actual versus
 * planned entry/exit, rule state, and lesson tags."
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

import { describe, expect, it } from "vitest";
import { evaluateTrackRecordEligibility, type TrackRecordInputs } from "@/lib/promotion/eligibility";
import { DEFAULT_TRACK_RECORD_POLICIES } from "@/lib/promotion/trackRecordPolicy";

const NOVICE_TO_PRO_PASSING: TrackRecordInputs = {
  completedTrades: 30,
  accountAgeDays: 70,
  executionScore: 85,
  stopAdherenceRatio: 0.95,
  positionSizeComplianceRatio: 0.98,
  hadSevereRiskEventRecently: false,
  educationCompleted: true,
  practiceValidationCompleted: true,
  cumulativeReturnPct: 0,
  expectancyR: 0,
};

const PRO_TO_EXPERT_PASSING: TrackRecordInputs = {
  ...NOVICE_TO_PRO_PASSING,
  completedTrades: 60,
  accountAgeDays: 100,
  executionScore: 88,
  stopAdherenceRatio: 0.96,
  positionSizeComplianceRatio: 0.97,
  cumulativeReturnPct: 10,
  expectancyR: 0.2,
};

describe("evaluateTrackRecordEligibility", () => {
  it("novice_to_pro: eligible with no profitability requirement, and omits profitability rows entirely", () => {
    const policy = DEFAULT_TRACK_RECORD_POLICIES.novice_to_pro;
    const result = evaluateTrackRecordEligibility(NOVICE_TO_PRO_PASSING, policy);
    expect(result.eligible).toBe(true);
    expect(result.requirements.find((r) => r.key === "profitability")).toBeUndefined();
    expect(result.requirements.find((r) => r.key === "expectancy")).toBeUndefined();
  });

  it("pro_to_expert: requires cumulative return and expectancy on top of the behavioral checklist", () => {
    const policy = DEFAULT_TRACK_RECORD_POLICIES.pro_to_expert;
    const result = evaluateTrackRecordEligibility(PRO_TO_EXPERT_PASSING, policy);
    expect(result.eligible).toBe(true);
    expect(result.requirements.find((r) => r.key === "profitability")?.met).toBe(true);
    expect(result.requirements.find((r) => r.key === "expectancy")?.met).toBe(true);
  });

  it("pro_to_expert: fails when profitability is below the floor even if behavior otherwise passes", () => {
    const policy = DEFAULT_TRACK_RECORD_POLICIES.pro_to_expert;
    const result = evaluateTrackRecordEligibility({ ...PRO_TO_EXPERT_PASSING, cumulativeReturnPct: 2 }, policy);
    expect(result.eligible).toBe(false);
    expect(result.requirements.find((r) => r.key === "profitability")?.met).toBe(false);
  });

  it("expert_to_wall_street: the hardest transition rejects pro_to_expert-level performance", () => {
    const policy = DEFAULT_TRACK_RECORD_POLICIES.expert_to_wall_street;
    const result = evaluateTrackRecordEligibility(PRO_TO_EXPERT_PASSING, policy);
    expect(result.eligible).toBe(false);
  });

  it("ladder is asymmetric: expert_to_wall_street's thresholds are strictly at or above pro_to_expert's", () => {
    const pro = DEFAULT_TRACK_RECORD_POLICIES.pro_to_expert;
    const wallStreet = DEFAULT_TRACK_RECORD_POLICIES.expert_to_wall_street;
    expect(wallStreet.minCompletedTrades).toBeGreaterThan(pro.minCompletedTrades);
    expect(wallStreet.minAccountAgeDays).toBeGreaterThan(pro.minAccountAgeDays);
    expect(wallStreet.minExecutionScore).toBeGreaterThan(pro.minExecutionScore);
    expect(wallStreet.minCumulativeReturnPct).toBeGreaterThan(pro.minCumulativeReturnPct);
    expect(wallStreet.minExpectancyR).toBeGreaterThan(pro.minExpectancyR);
    // Severity ceiling is stricter (lower) at the top, not higher.
    expect(wallStreet.severeDrawdownPct).toBeLessThan(pro.severeDrawdownPct);
  });

  it("novice_to_pro stays the easiest transition on every threshold", () => {
    const novice = DEFAULT_TRACK_RECORD_POLICIES.novice_to_pro;
    const pro = DEFAULT_TRACK_RECORD_POLICIES.pro_to_expert;
    expect(novice.minCompletedTrades).toBeLessThan(pro.minCompletedTrades);
    expect(novice.minAccountAgeDays).toBeLessThan(pro.minAccountAgeDays);
    expect(novice.minCumulativeReturnPct).toBe(0);
    expect(novice.minExpectancyR).toBe(0);
  });
});

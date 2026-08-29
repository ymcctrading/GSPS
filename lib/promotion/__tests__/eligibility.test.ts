import { describe, expect, it } from "vitest";
import { evaluatePromotionReadiness, type PromotionReadinessInputs } from "@/lib/promotion/eligibility";
import { DEFAULT_PROMOTION_POLICY } from "@/lib/promotion/config";

const PASSING: PromotionReadinessInputs = {
  completedTrades: 30,
  accountAgeDays: 70,
  executionScore: 85,
  stopAdherenceRatio: 0.95,
  positionSizeComplianceRatio: 0.98,
  hadSevereRiskEventRecently: false,
  educationCompleted: true,
  practiceValidationCompleted: true,
};

describe("evaluatePromotionReadiness", () => {
  it("is eligible when every requirement clears the default policy", () => {
    const readiness = evaluatePromotionReadiness(PASSING);
    expect(readiness.eligible).toBe(true);
    expect(readiness.requirements.every((r) => r.met)).toBe(true);
    expect(readiness.requirements).toHaveLength(8);
  });

  it("is not eligible when a single requirement misses, and reports only that one as unmet", () => {
    const readiness = evaluatePromotionReadiness({ ...PASSING, completedTrades: 24 });
    expect(readiness.eligible).toBe(false);
    const unmet = readiness.requirements.filter((r) => !r.met);
    expect(unmet).toHaveLength(1);
    expect(unmet[0].key).toBe("experience");
  });

  it("reports every unmet requirement, not just the first", () => {
    const readiness = evaluatePromotionReadiness({
      ...PASSING,
      completedTrades: 0,
      accountAgeDays: 0,
      educationCompleted: false,
    });
    const unmetKeys = readiness.requirements.filter((r) => !r.met).map((r) => r.key);
    expect(unmetKeys).toEqual(expect.arrayContaining(["experience", "time", "education"]));
    expect(readiness.eligible).toBe(false);
  });

  it("fails riskState on a recent severe cooldown/lock even when every other metric passes", () => {
    const readiness = evaluatePromotionReadiness({ ...PASSING, hadSevereRiskEventRecently: true });
    expect(readiness.eligible).toBe(false);
    expect(readiness.requirements.find((r) => r.key === "riskState")?.met).toBe(false);
  });

  it("respects an overridden policy threshold", () => {
    const stricterPolicy = { ...DEFAULT_PROMOTION_POLICY, minCompletedTrades: 100 };
    const readiness = evaluatePromotionReadiness(PASSING, stricterPolicy);
    expect(readiness.eligible).toBe(false);
    expect(readiness.requirements.find((r) => r.key === "experience")?.met).toBe(false);
  });
});

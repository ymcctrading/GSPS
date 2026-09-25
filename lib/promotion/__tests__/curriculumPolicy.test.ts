import { describe, expect, it } from "vitest";
import { evaluateCurriculumEligibility, mandatoryComponentMet, type CurriculumProgressInputs } from "@/lib/promotion/curriculumPolicy";

const NONE: CurriculumProgressInputs = {
  foundationsEducationCompletedAt: null,
  practiceValidationCompletedAt: null,
  advancedCurriculumCompletedAt: null,
  capstoneCompletedAt: null,
};

describe("evaluateCurriculumEligibility", () => {
  it("novice_to_pro requires both foundations education and practice validation", () => {
    expect(evaluateCurriculumEligibility("novice_to_pro", NONE).eligible).toBe(false);
    expect(
      evaluateCurriculumEligibility("novice_to_pro", {
        ...NONE,
        foundationsEducationCompletedAt: "2026-01-01",
      }).eligible,
    ).toBe(false);
    expect(
      evaluateCurriculumEligibility("novice_to_pro", {
        ...NONE,
        foundationsEducationCompletedAt: "2026-01-01",
        practiceValidationCompletedAt: "2026-01-01",
      }).eligible,
    ).toBe(true);
  });

  it("pro_to_expert requires the advanced curriculum flag alone", () => {
    expect(evaluateCurriculumEligibility("pro_to_expert", NONE).eligible).toBe(false);
    expect(
      evaluateCurriculumEligibility("pro_to_expert", { ...NONE, advancedCurriculumCompletedAt: "2026-01-01" })
        .eligible,
    ).toBe(true);
  });

  it("expert_to_wall_street requires the capstone alone", () => {
    expect(evaluateCurriculumEligibility("expert_to_wall_street", NONE).eligible).toBe(false);
    expect(
      evaluateCurriculumEligibility("expert_to_wall_street", { ...NONE, capstoneCompletedAt: "2026-01-01" }).eligible,
    ).toBe(true);
  });
});

describe("mandatoryComponentMet", () => {
  it("is always true for novice_to_pro and pro_to_expert regardless of inputs", () => {
    expect(mandatoryComponentMet("novice_to_pro", NONE)).toBe(true);
    expect(mandatoryComponentMet("pro_to_expert", NONE)).toBe(true);
  });

  it("is false for expert_to_wall_street until the capstone completes, even via other paths", () => {
    expect(mandatoryComponentMet("expert_to_wall_street", NONE)).toBe(false);
    expect(mandatoryComponentMet("expert_to_wall_street", { ...NONE, capstoneCompletedAt: "2026-01-01" })).toBe(true);
  });
});

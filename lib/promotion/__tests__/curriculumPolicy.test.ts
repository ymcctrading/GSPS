import { describe, expect, it } from "vitest";
import { evaluateCurriculumEligibility, mandatoryComponentMet, type CurriculumProgressInputs } from "@/lib/promotion/curriculumPolicy";

const NONE: CurriculumProgressInputs = {
  foundationsEducationCompletedAt: null,
  practiceValidationCompletedAt: null,
  advancedCurriculumCompletedAt: null,
  capstoneCompletedAt: null,
};

describe("evaluateCurriculumEligibility", () => {
  it("novice_to_pro requires foundations education, practice validation and the exam", () => {
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
        noviceExamPassedAt: "2026-09-28",
      }).eligible,
    ).toBe(true);
  });

  it("pro_to_expert requires the advanced curriculum flag and the exam", () => {
    expect(evaluateCurriculumEligibility("pro_to_expert", NONE).eligible).toBe(false);
    expect(
      evaluateCurriculumEligibility("pro_to_expert", { ...NONE, advancedCurriculumCompletedAt: "2026-01-01", proExamPassedAt: "2026-09-28" })
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
  it("is always true for novice_to_pro and pro_to_expert: the exams belong to the curriculum path only", () => {
    expect(mandatoryComponentMet("novice_to_pro", NONE)).toBe(true);
    expect(mandatoryComponentMet("pro_to_expert", NONE)).toBe(true);
  });

  it("requires the graduation exam on the curriculum path", () => {
    const done = { ...NONE, foundationsEducationCompletedAt: "2026-01-01", practiceValidationCompletedAt: "2026-01-01", advancedCurriculumCompletedAt: "2026-01-01" };
    expect(evaluateCurriculumEligibility("novice_to_pro", done).eligible).toBe(false);
    expect(evaluateCurriculumEligibility("novice_to_pro", { ...done, noviceExamPassedAt: "2026-09-28" }).eligible).toBe(true);
    expect(evaluateCurriculumEligibility("pro_to_expert", done).eligible).toBe(false);
    expect(evaluateCurriculumEligibility("pro_to_expert", { ...done, proExamPassedAt: "2026-09-28" }).eligible).toBe(true);
  });

  it("is false for expert_to_wall_street until the capstone completes, even via other paths", () => {
    expect(mandatoryComponentMet("expert_to_wall_street", NONE)).toBe(false);
    expect(mandatoryComponentMet("expert_to_wall_street", { ...NONE, capstoneCompletedAt: "2026-01-01" })).toBe(true);
  });
});

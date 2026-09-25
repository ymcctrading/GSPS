import { describe, expect, it } from "vitest";
import { evaluatePromotionPaths } from "@/lib/promotion/paths";
import { DEFAULT_TRACK_RECORD_POLICIES } from "@/lib/promotion/trackRecordPolicy";
import type { CurriculumProgressInputs } from "@/lib/promotion/curriculumPolicy";
import type { TrackRecordInputs } from "@/lib/promotion/eligibility";

const NO_CURRICULUM: CurriculumProgressInputs = {
  foundationsEducationCompletedAt: null,
  practiceValidationCompletedAt: null,
  advancedCurriculumCompletedAt: null,
  capstoneCompletedAt: null,
};

const FAILING_TRACK_RECORD: TrackRecordInputs = {
  completedTrades: 0,
  accountAgeDays: 0,
  executionScore: 0,
  stopAdherenceRatio: 0,
  positionSizeComplianceRatio: 0,
  hadSevereRiskEventRecently: true,
  educationCompleted: false,
  practiceValidationCompleted: false,
  cumulativeReturnPct: 0,
  expectancyR: 0,
};

describe("evaluatePromotionPaths", () => {
  it("is eligible via curriculum alone when track record and payment both fail", () => {
    const result = evaluatePromotionPaths("novice_to_pro", {
      curriculum: { ...NO_CURRICULUM, foundationsEducationCompletedAt: "2026-01-01", practiceValidationCompletedAt: "2026-01-01" },
      trackRecord: FAILING_TRACK_RECORD,
      trackRecordPolicy: DEFAULT_TRACK_RECORD_POLICIES.novice_to_pro,
      payToPlayPurchased: false,
    });
    expect(result.eligible).toBe(true);
    expect(result.eligiblePaths).toEqual(["curriculum"]);
  });

  it("is eligible via pay-to-play alone when curriculum and track record both fail", () => {
    const result = evaluatePromotionPaths("novice_to_pro", {
      curriculum: NO_CURRICULUM,
      trackRecord: FAILING_TRACK_RECORD,
      trackRecordPolicy: DEFAULT_TRACK_RECORD_POLICIES.novice_to_pro,
      payToPlayPurchased: true,
    });
    expect(result.eligible).toBe(true);
    expect(result.eligiblePaths).toEqual(["pay_to_play"]);
  });

  it("expert_to_wall_street: no path clears without the mandatory capstone, even with a completed purchase", () => {
    const result = evaluatePromotionPaths("expert_to_wall_street", {
      curriculum: NO_CURRICULUM,
      trackRecord: FAILING_TRACK_RECORD,
      trackRecordPolicy: DEFAULT_TRACK_RECORD_POLICIES.expert_to_wall_street,
      payToPlayPurchased: true,
    });
    expect(result.mandatoryComponentMet).toBe(false);
    expect(result.eligiblePaths).toEqual([]);
    expect(result.eligible).toBe(false);
  });

  it("expert_to_wall_street: pay-to-play clears once the capstone is also done (capstone alone also satisfies curriculum, since that path's own requirement IS the capstone)", () => {
    const result = evaluatePromotionPaths("expert_to_wall_street", {
      curriculum: { ...NO_CURRICULUM, capstoneCompletedAt: "2026-01-01" },
      trackRecord: FAILING_TRACK_RECORD,
      trackRecordPolicy: DEFAULT_TRACK_RECORD_POLICIES.expert_to_wall_street,
      payToPlayPurchased: true,
    });
    expect(result.mandatoryComponentMet).toBe(true);
    expect(result.eligiblePaths.sort()).toEqual(["curriculum", "pay_to_play"]);
  });

  it("reports multiple eligible paths at once when more than one clears", () => {
    const result = evaluatePromotionPaths("novice_to_pro", {
      curriculum: { ...NO_CURRICULUM, foundationsEducationCompletedAt: "2026-01-01", practiceValidationCompletedAt: "2026-01-01" },
      trackRecord: FAILING_TRACK_RECORD,
      trackRecordPolicy: DEFAULT_TRACK_RECORD_POLICIES.novice_to_pro,
      payToPlayPurchased: true,
    });
    expect(result.eligiblePaths.sort()).toEqual(["curriculum", "pay_to_play"]);
  });
});

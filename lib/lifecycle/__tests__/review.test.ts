import { describe, expect, it } from "vitest";
import type { TradePlan } from "@/lib/lifecycle/types";
import { buildPostCloseReview } from "@/lib/lifecycle/review";
import { freshEntryConfirmation } from "@/lib/lifecycle/entryConfirmation";

function closedPlan(overrides: Partial<TradePlan> = {}): TradePlan {
  return {
    planId: "plan-1",
    strategyVersion: "1.0.0",
    signalId: "sig-1",
    userId: "user-1",
    instrument: "AAPL",
    market: "us_equity",
    timeframe: "1Day",
    generatedAt: "2026-08-29T13:00:00.000Z",
    expiresAt: "2026-09-05T13:00:00.000Z",
    direction: "bullish",
    signalFingerprint: "sig-1",
    entryConfirmation: freshEntryConfirmation(),
    coordinates: {
      entryTrigger: 100,
      entryLimitTolerance: 0.5,
      invalidation: 97,
      stopType: "stop_market",
      takeProfit1: 105,
      takeProfit2: 108,
      masterProfit: 110,
      runnerRule: { enabled: true, description: "Trail without lowering the Master Profit floor." },
    },
    risk: {
      approvedQuantity: 10,
      fractionalCapability: false,
      plannedDollarRisk: 30,
      allocationPct: 2,
      totalOpenRiskSnapshot: 500,
    },
    evidence: {
      regime: { regime: "trend", direction: "bullish", reasons: [], disqualifiers: [] },
      alignment: { score: 82, tier: "aTier", blueprintScoreBand: "ACTIONABLE", breakdown: [] },
      dataTimestamps: {},
      eventLiquidityStatus: "clear",
    },
    state: "closed",
    version: 5,
    audit: [],
    actualEntryPrice: 100.1,
    actualEntryAt: "2026-08-29T14:00:00.000Z",
    highWater: 111,
    masterProfitFloor: 110,
    closedAt: "2026-08-30T14:00:00.000Z",
    closeReason: "user closed manually",
    ...overrides,
  };
}

describe("buildPostCloseReview", () => {
  it("marks adherence as followed when entry fell inside tolerance", () => {
    const review = buildPostCloseReview(closedPlan());
    expect(review.planAdherence).toBe("followed");
    expect(review.lessonTags).toContain("master_profit_floor_protected");
  });

  it("marks adherence as deviated when entry fell outside tolerance", () => {
    const review = buildPostCloseReview(closedPlan({ actualEntryPrice: 102 }));
    expect(review.planAdherence).toBe("deviated");
    expect(review.lessonTags).toContain("entry_deviated_from_plan");
  });

  it("marks a never-entered plan distinctly", () => {
    const review = buildPostCloseReview(
      closedPlan({ state: "expired", actualEntryPrice: null, actualEntryAt: null, masterProfitFloor: null }),
    );
    expect(review.planAdherence).toBe("not_entered");
    expect(review.lessonTags).toContain("trigger_never_occurred");
  });

  it("tags an invalidated plan with the stop/invalidation lesson", () => {
    const review = buildPostCloseReview(closedPlan({ state: "invalidated" }));
    expect(review.lessonTags).toContain("stop_or_invalidation_hit");
  });

  it("carries the plan's own Rules Alignment evidence through unchanged", () => {
    const review = buildPostCloseReview(closedPlan());
    expect(review.alignment).toEqual({ score: 82, tier: "aTier", blueprintScoreBand: "ACTIONABLE", breakdown: [] });
  });

  it("surfaces per-criterion breakdown items when the plan carries them", () => {
    const review = buildPostCloseReview(
      closedPlan({
        evidence: {
          regime: { regime: "trend", direction: "bullish", reasons: [], disqualifiers: [] },
          alignment: {
            score: 90,
            tier: "aPlusTier",
            blueprintScoreBand: "HIGH_CONFLUENCE",
            breakdown: [
              { key: "trendAlignment", label: "Trend alignment", points: 10, maxPoints: 10, applicable: true, passed: true, note: "Aligned with the 9-day swing." },
            ],
          },
          dataTimestamps: {},
          eventLiquidityStatus: "clear",
        },
      }),
    );
    expect(review.alignment.breakdown).toHaveLength(1);
    expect(review.alignment.breakdown[0].key).toBe("trendAlignment");
  });
});

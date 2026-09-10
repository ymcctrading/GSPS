import { describe, expect, it } from "vitest";
import type { TradePlan } from "@/lib/lifecycle/types";
import { freshEntryConfirmation } from "@/lib/lifecycle/entryConfirmation";
import { buildPivotTradePlanFromStoppedPlan } from "@/lib/lifecycle/fromPivot";

function stoppedPlan(overrides: Partial<TradePlan> = {}): TradePlan {
  return {
    planId: "plan-1",
    strategyVersion: "1.0.0",
    signalId: "sig-1",
    userId: "user-1",
    instrument: "AAPL",
    market: "us_equity",
    timeframe: "15Min",
    generatedAt: "2026-08-29T13:00:00.000Z",
    expiresAt: "2026-09-05T13:00:00.000Z",
    direction: "bullish",
    signalFingerprint: "AAPL:15Min:1.0.0:sig-1",
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
    state: "invalidated",
    version: 3,
    audit: [],
    actualEntryPrice: 100,
    actualEntryAt: "2026-08-30T13:00:00.000Z",
    highWater: 100,
    masterProfitFloor: null,
    closedAt: "2026-08-31T13:00:00.000Z",
    closeReason: "Automated position stopped out at 97.",
    ...overrides,
  };
}

describe("buildPivotTradePlanFromStoppedPlan", () => {
  it("flips direction and enters at the level whose breach ended the original thesis", () => {
    const input = buildPivotTradePlanFromStoppedPlan(stoppedPlan(), { generatedAt: "2026-09-01T00:00:00.000Z" });
    expect(input).not.toBeNull();
    expect(input!.direction).toBe("bearish");
    expect(input!.coordinates.entryTrigger).toBe(97); // the original invalidation level
  });

  it("sets the reversal's own stop at the original entry — the extreme in the original direction", () => {
    // Original: entry 100, invalidation 97 -> risk 3, bullish.
    // Pivot: bearish, entry 97; its own stop is the original entry, 100.
    const input = buildPivotTradePlanFromStoppedPlan(stoppedPlan(), { generatedAt: "2026-09-01T00:00:00.000Z" });
    expect(input!.coordinates.invalidation).toBe(100);
  });

  it("targets one and two risk-multiples beyond the new entry, in the new direction", () => {
    const input = buildPivotTradePlanFromStoppedPlan(stoppedPlan(), { generatedAt: "2026-09-01T00:00:00.000Z" });
    expect(input!.coordinates.takeProfit1).toBe(97 - 3); // entry - 1x risk, bearish
    expect(input!.coordinates.takeProfit2).toBe(97 - 2 * 3); // entry - 2x risk, bearish
    expect(input!.coordinates.masterProfit).toBe(input!.coordinates.takeProfit2);
  });

  it("starts fresh at watchlist confirmation and a unique, stop-out-scoped fingerprint", () => {
    const input = buildPivotTradePlanFromStoppedPlan(stoppedPlan(), { generatedAt: "2026-09-01T00:00:00.000Z" });
    expect(input!.entryConfirmation).toEqual(freshEntryConfirmation());
    expect(input!.signalFingerprint).toBe("pivot:plan-1:2026-09-01T00:00:00.000Z");
    expect(input!.signalId).toBe("pivot:plan-1");
  });

  it("flips a bearish original into a bullish pivot with correctly ordered targets", () => {
    const bearishStopped = stoppedPlan({
      direction: "bearish",
      coordinates: {
        entryTrigger: 100,
        entryLimitTolerance: 0.5,
        invalidation: 103, // bearish: stop above entry
        stopType: "stop_market",
        takeProfit1: 95,
        takeProfit2: 92,
        masterProfit: 90,
        runnerRule: { enabled: true, description: "" },
      },
    });
    const input = buildPivotTradePlanFromStoppedPlan(bearishStopped, { generatedAt: "2026-09-01T00:00:00.000Z" });
    expect(input!.direction).toBe("bullish");
    expect(input!.coordinates.entryTrigger).toBe(103);
    expect(input!.coordinates.invalidation).toBe(100); // the original entry — extreme of the original (bearish) direction
    expect(input!.coordinates.takeProfit1).toBe(103 + 3); // entry + 1x risk, bullish
    expect(input!.coordinates.takeProfit2).toBe(103 + 2 * 3);
  });

  it("returns null when the original plan carries no positive risk to size a reversal against", () => {
    const degenerate = stoppedPlan({
      coordinates: {
        entryTrigger: 100,
        entryLimitTolerance: 0.5,
        invalidation: 100, // zero risk
        stopType: "stop_market",
        takeProfit1: 105,
        takeProfit2: 108,
        masterProfit: 110,
        runnerRule: { enabled: true, description: "" },
      },
    });
    expect(buildPivotTradePlanFromStoppedPlan(degenerate, { generatedAt: "2026-09-01T00:00:00.000Z" })).toBeNull();
  });
});

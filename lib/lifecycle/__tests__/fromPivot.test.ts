import { describe, expect, it } from "vitest";
import type { TradePlan } from "@/lib/lifecycle/types";
import { freshEntryConfirmation } from "@/lib/lifecycle/entryConfirmation";
import { buildPivotTradePlanFromStoppedPlan } from "@/lib/lifecycle/fromPivot";
import { gannThreePoints } from "@/lib/gann/pointScale";

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

  it("sets the reversal's stop 3 points beyond the old trade's extreme (A-EXIT-02)", () => {
    // Original: bullish, entry 100. With no extreme known, the entry stands in for the top.
    const input = buildPivotTradePlanFromStoppedPlan(stoppedPlan(), { generatedAt: "2026-09-01T00:00:00.000Z" });
    expect(input!.coordinates.invalidation).toBeCloseTo(100 + gannThreePoints(100), 10);
    // The top the long reached, and the level that broke, when the exit manager knows them.
    const known = buildPivotTradePlanFromStoppedPlan(stoppedPlan(), {
      generatedAt: "2026-09-01T00:00:00.000Z",
      brokenLevel: 101,
      extreme: 106,
    });
    expect(known!.coordinates.entryTrigger).toBe(101);
    expect(known!.coordinates.invalidation).toBeCloseTo(106 + gannThreePoints(106), 10);
  });

  it("marks levels to watch one and two risk-multiples beyond the new entry, in the new direction", () => {
    const input = buildPivotTradePlanFromStoppedPlan(stoppedPlan(), { generatedAt: "2026-09-01T00:00:00.000Z" });
    const risk = 100 + gannThreePoints(100) - 97;
    expect(input!.coordinates.takeProfit1).toBeCloseTo(97 - risk, 10);
    expect(input!.coordinates.takeProfit2).toBeCloseTo(97 - 2 * risk, 10);
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
    // The original entry is the bearish trade's extreme; the stop is 3 points under it.
    const stop = 100 - gannThreePoints(100);
    expect(input!.coordinates.invalidation).toBeCloseTo(stop, 10);
    expect(input!.coordinates.takeProfit1).toBeCloseTo(103 + (103 - stop), 10);
    expect(input!.coordinates.takeProfit2).toBeCloseTo(103 + 2 * (103 - stop), 10);
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

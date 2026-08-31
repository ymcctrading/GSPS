import { describe, expect, it } from "vitest";
import type { TradePlan } from "@/lib/lifecycle/types";
import { freshEntryConfirmation } from "@/lib/lifecycle/entryConfirmation";
import { checkPlanEligibleForAutomation } from "@/lib/automation/service";

function plan(overrides: Partial<TradePlan> = {}): TradePlan {
  return {
    planId: "plan-1",
    strategyVersion: "1.0.0",
    signalId: "sig-1",
    userId: "user-1",
    instrument: "AAPL",
    market: "us_equity",
    timeframe: "15Min",
    generatedAt: "2026-08-31T13:00:00.000Z",
    expiresAt: "2026-09-01T13:00:00.000Z",
    direction: "bullish",
    signalFingerprint: "AAPL:15Min:1.0.0:sig-1",
    entryConfirmation: freshEntryConfirmation(),
    coordinates: {
      entryTrigger: 100,
      entryLimitTolerance: 0,
      invalidation: 97,
      stopType: "stop_market",
      takeProfit1: 105,
      takeProfit2: 108,
      masterProfit: 110,
      runnerRule: { enabled: true, description: "" },
    },
    risk: {
      approvedQuantity: 0,
      fractionalCapability: false,
      plannedDollarRisk: 0,
      allocationPct: 0,
      totalOpenRiskSnapshot: 0,
    },
    evidence: {
      regime: { regime: "trend", direction: "bullish", reasons: [], disqualifiers: [] },
      alignment: { score: 0, tier: "watchlistOnly", breakdown: [] },
      dataTimestamps: {},
      eventLiquidityStatus: "clear",
    },
    state: "watchlist",
    version: 0,
    audit: [],
    actualEntryPrice: null,
    actualEntryAt: null,
    highWater: null,
    masterProfitFloor: null,
    closedAt: null,
    closeReason: null,
    ...overrides,
  };
}

describe("checkPlanEligibleForAutomation", () => {
  it("blocks a plan still awaiting entry confirmation", () => {
    const r = checkPlanEligibleForAutomation(plan({ state: "awaiting_entry_confirmation" }));
    expect(r.eligible).toBe(false);
    expect(r.blockReasons[0]).toMatch(/entry not yet confirmed/i);
  });

  it("blocks a watchlist/qualified plan", () => {
    expect(checkPlanEligibleForAutomation(plan({ state: "qualified" })).eligible).toBe(false);
  });

  it("blocks an expired armed plan", () => {
    const r = checkPlanEligibleForAutomation(
      plan({ state: "armed", expiresAt: "2020-01-01T00:00:00.000Z" }),
    );
    expect(r.eligible).toBe(false);
  });

  it("blocks a closed/invalidated plan", () => {
    expect(checkPlanEligibleForAutomation(plan({ state: "invalidated" })).eligible).toBe(false);
    expect(checkPlanEligibleForAutomation(plan({ state: "closed" })).eligible).toBe(false);
  });

  it("allows an armed, unexpired plan", () => {
    const r = checkPlanEligibleForAutomation(
      plan({ state: "armed", expiresAt: "2099-01-01T00:00:00.000Z" }),
    );
    expect(r.eligible).toBe(true);
    expect(r.blockReasons).toHaveLength(0);
  });

  it("allows an already-entered plan (mid-lifecycle automation resume)", () => {
    const r = checkPlanEligibleForAutomation(plan({ state: "entered" }));
    expect(r.eligible).toBe(true);
  });
});

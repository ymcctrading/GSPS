import { describe, expect, it, vi } from "vitest";
import type { Bar } from "@/lib/types";
import type { TradePlan } from "@/lib/lifecycle/types";

const fetchBars = vi.hoisted(() => vi.fn());
vi.mock("@/lib/data/provider", () => ({ getMarketDataProvider: () => ({ fetchBars }) }));

import { freshEntryConfirmation } from "@/lib/lifecycle/entryConfirmation";
import { confirmationFromBars, readEntryConfirmationNow } from "@/lib/lifecycle/confirmNow";
import {
  REBUY_SESSIONS,
  buildRebuyTradePlanFromStoppedPlan,
  isRebuySignal,
  rebuyExtremeOf,
  sessionsDeadline,
} from "@/lib/lifecycle/fromRebuy";
import { etDateKey } from "@/lib/market/session";

function bar(t: string, o: number, h: number, l: number, c: number): Bar {
  return { t, o, h, l, c, v: 1000 };
}

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
    risk: { approvedQuantity: 10, fractionalCapability: false, plannedDollarRisk: 30, allocationPct: 2, totalOpenRiskSnapshot: 500 },
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
    highWater: 120,
    masterProfitFloor: null,
    closedAt: "2026-09-01T15:00:00.000Z",
    closeReason: "Automated position stopped out at 117.",
    ...overrides,
  };
}

const REBUY = { side: "long" as const, entry: 114, stop: 111, extreme: 120 };

describe("buildRebuyTradePlanFromStoppedPlan", () => {
  it("rests on the same side at the reaction, with the stop half the reaction beyond (A-PYRAMID-07)", () => {
    const at = "2026-09-01T15:00:00.000Z";
    const p = buildRebuyTradePlanFromStoppedPlan(stoppedPlan(), { generatedAt: at, rebuy: REBUY })!;
    expect(p.direction).toBe("bullish");
    expect(isRebuySignal(p.signalId)).toBe(true);
    expect(p.coordinates.entryTrigger).toBe(114);
    expect(p.coordinates.invalidation).toBe(111);
    expect(p.coordinates.entryKind).toBe("oldLevel");
    // Levels to watch, one and two risks out; nothing exits there (Q14).
    expect(p.coordinates.takeProfit1).toBe(117);
    expect(p.coordinates.takeProfit2).toBe(120);
    expect(p.signalFingerprint).toBe(`rebuy:plan-1:${at}`);
    expect(rebuyExtremeOf({ signalId: p.signalId, evidence: p.evidence })).toBe(120);
    expect(p.expiresAt).toBe(sessionsDeadline(at, "us_equity", REBUY_SESSIONS));
  });

  it("mirrors for a short and refuses a re-entry on the other side", () => {
    const short = stoppedPlan({ direction: "bearish" });
    const p = buildRebuyTradePlanFromStoppedPlan(short, { generatedAt: "2026-09-01T15:00:00.000Z", rebuy: { side: "short", entry: 86, stop: 89, extreme: 80 } })!;
    expect(p.direction).toBe("bearish");
    expect(p.coordinates.takeProfit1).toBe(83);
    expect(buildRebuyTradePlanFromStoppedPlan(short, { generatedAt: "2026-09-01T15:00:00.000Z", rebuy: REBUY })).toBeNull();
  });

  it("reads no extreme from a plan that is not a re-buy", () => {
    expect(rebuyExtremeOf({ signalId: "pivot:plan-1", evidence: { ...stoppedPlan().evidence, dataTimestamps: { rebuyExtreme: "120" } } })).toBeNull();
  });
});

describe("sessionsDeadline", () => {
  it("ends at the close of the tenth session, the stop's own counted first", () => {
    // Tuesday 2026-09-01 is the first; Labor Day is the 7th, so the tenth is Tuesday the 15th.
    const end = sessionsDeadline("2026-09-01T15:00:00.000Z", "us_equity", REBUY_SESSIONS);
    expect(etDateKey(new Date(end))).toBe("2026-09-15");
  });
});

describe("the re-buy's confirmation", () => {
  it("goes at the market once a bar reacts into the zone", () => {
    const bars = [bar("2026-09-02T14:00:00Z", 116, 117, 115, 116), bar("2026-09-02T14:15:00Z", 116, 116, 113.5, 114.5)];
    const read = confirmationFromBars(bars, "bullish", 114, 111, "oldLevel", 120);
    expect(read.ready).toBe(true);
  });

  it("is called off by a new high before the reaction, that bar first, as the replay's walkRebuy reads it", () => {
    const resumed = [bar("2026-09-02T14:00:00Z", 116, 120.5, 113, 119)];
    const read = confirmationFromBars(resumed, "bullish", 114, 111, "oldLevel", 120);
    expect(read.ready).toBe(false);
    expect(read.stage).toBe("dead");
    expect(read.note).toContain("new extreme");
  });

  it("is called off by a close through its stop", () => {
    const read = confirmationFromBars([bar("2026-09-02T14:00:00Z", 116, 116, 110, 110.5)], "bullish", 114, 111, "oldLevel", 120);
    expect(read.stage).toBe("dead");
  });

  it("reads only the bars after the stop, not the four days before it", async () => {
    fetchBars.mockReset();
    fetchBars.mockImplementation(async (_s: string, tf: string, start: Date) => {
      if (tf !== "15Min") return [];
      // A bar before the stop that made the high would call it off if read.
      const all = [bar("2026-09-01T14:00:00Z", 118, 121, 117, 118), bar("2026-09-02T14:00:00Z", 116, 116, 113.5, 114.5)];
      return all.filter((b) => Date.parse(b.t) >= start.getTime());
    });
    const read = await readEntryConfirmationNow({
      symbol: "AAPL",
      assetClass: "us_equity",
      direction: "bullish",
      entryTrigger: 114,
      stopPrice: 111,
      entryKind: "oldLevel",
      since: "2026-09-01T15:00:00.000Z",
      cancelBeyond: 120,
      now: new Date("2026-09-02T15:00:00Z"),
    });
    expect(read.ready).toBe(true);
    expect(fetchBars.mock.calls[0][2].toISOString()).toBe("2026-09-01T15:00:00.000Z");
  });
});

import { afterEach, describe, expect, it } from "vitest";
import {
  clearCachedPlans,
  MAX_CACHED_PLANS,
  planEvent,
  planSessionKey,
  readCachedPlan,
  writeCachedPlan,
} from "@/lib/scan/planCache";
import type { ScanResult } from "@/lib/types";

// 2026-10-27 is a Tuesday; EDT, so 16:00 ET is 20:00 UTC.
describe("planSessionKey", () => {
  it("reads the prior session before the close and today's after it", () => {
    expect(planSessionKey("us_equity", new Date("2026-10-27T19:59:00Z"))).toBe("2026-10-26");
    expect(planSessionKey("us_equity", new Date("2026-10-27T20:00:00Z"))).toBe("2026-10-27");
  });

  it("holds Friday's session over the weekend and Monday morning", () => {
    expect(planSessionKey("us_equity", new Date("2026-10-31T15:00:00Z"))).toBe("2026-10-30");
    expect(planSessionKey("us_equity", new Date("2026-11-02T14:00:00Z"))).toBe("2026-10-30");
  });

  it("skips a market holiday", () => {
    // Thanksgiving 2026 is Thursday Nov 26.
    expect(planSessionKey("us_equity", new Date("2026-11-26T22:00:00Z"))).toBe("2026-11-25");
  });

  it("closes at 1:00 PM ET on an early close", () => {
    // Friday Nov 27 2026, EST: 13:00 ET is 18:00 UTC.
    expect(planSessionKey("us_equity", new Date("2026-11-27T17:59:00Z"))).toBe("2026-11-25");
    expect(planSessionKey("us_equity", new Date("2026-11-27T18:00:00Z"))).toBe("2026-11-27");
  });

  it("reads crypto on the UTC day", () => {
    expect(planSessionKey("crypto", new Date("2026-10-27T23:59:00Z"))).toBe("2026-10-27");
    expect(planSessionKey("crypto", new Date("2026-10-28T00:00:00Z"))).toBe("2026-10-28");
  });
});

function plan(overrides: Partial<ScanResult> = {}): ScanResult {
  return {
    symbol: "SPY",
    assetClass: "us_equity",
    scannedAt: "2026-10-27T15:00:00Z",
    currentPrice: 100,
    direction: "bullish",
    levels: { entry: 101, stopLoss: 97, takeProfit1: 106, masterProfit: 112 },
    dayRange: 2,
    decision: { outputState: "Execute", score: 7 },
    ...overrides,
  } as unknown as ScanResult;
}

describe("planEvent", () => {
  it("stands while price stays between the levels", () => {
    expect(planEvent(plan(), 101.5)).toBeNull();
  });

  it("asks when price trades through the stop, for any score", () => {
    expect(planEvent(plan(), 96.9)).toBe("stop");
    expect(planEvent(plan({ decision: { outputState: "Watch", score: 4 } } as Partial<ScanResult>), 97)).toBe("stop");
    const short = plan({ direction: "bearish", levels: { entry: 99, stopLoss: 103, takeProfit1: 94, masterProfit: 88 } } as Partial<ScanResult>);
    expect(planEvent(short, 103)).toBe("stop");
    expect(planEvent(short, 100.5)).toBeNull();
  });

  it("never asks for a retired plan", () => {
    expect(planEvent(plan({ stopBreach: { stop: 97, price: 96, reclaimAt: 100 } }), 90)).toBeNull();
  });

  it("asks at the Execute cutoff when price passes TP1", () => {
    expect(planEvent(plan({ dayRange: 10 }), 106)).toBe("target");
    expect(planEvent(plan({ dayRange: 10, decision: { outputState: "Watch", score: 6 } } as Partial<ScanResult>), 106)).toBeNull();
  });

  it("asks when the entry's distance crosses a day's range", () => {
    // Scanned within a day's range (|100 - 101| = 1 <= 2); now 4 away.
    expect(planEvent(plan(), 105)).toBe("resting");
  });

  it("does not ask for a condition the scan already saw", () => {
    expect(planEvent(plan({ currentPrice: 107, dayRange: 10 }), 108)).toBeNull();
    expect(planEvent(plan({ currentPrice: 96 }), 95)).toBeNull();
  });

  it("ignores an unusable price or a plan with no levels", () => {
    expect(planEvent(plan(), null)).toBeNull();
    expect(planEvent(plan(), Number.NaN)).toBeNull();
    expect(planEvent(plan({ levels: undefined } as Partial<ScanResult>), 90)).toBeNull();
    expect(planEvent(plan({ direction: "none" }), 90)).toBeNull();
  });
});

describe("plan cache", () => {
  afterEach(() => clearCachedPlans());
  const morning = new Date("2026-10-27T15:00:00Z");

  it("keeps a plan for its session and drops it once a session closes", () => {
    writeCachedPlan("spy", plan(), true, morning);
    expect(readCachedPlan("SPY", new Date("2026-10-27T19:00:00Z"))?.exactScoreDisplayEnabled).toBe(true);
    expect(readCachedPlan("SPY", new Date("2026-10-27T20:01:00Z"))).toBeNull();
    // Dropped, not just hidden.
    expect(readCachedPlan("SPY", morning)).toBeNull();
  });

  it("keeps only the most recent symbols", () => {
    for (let i = 0; i <= MAX_CACHED_PLANS; i++) writeCachedPlan(`S${i}`, plan({ symbol: `S${i}` }), false, morning);
    expect(readCachedPlan("S0", morning)).toBeNull();
    expect(readCachedPlan(`S${MAX_CACHED_PLANS}`, morning)).not.toBeNull();
  });

  it("clears every plan", () => {
    writeCachedPlan("SPY", plan(), false, morning);
    clearCachedPlans();
    expect(readCachedPlan("SPY", morning)).toBeNull();
  });
});

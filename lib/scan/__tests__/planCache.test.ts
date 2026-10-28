import { afterEach, describe, expect, it } from "vitest";
import {
  bindCachedPlansTo,
  clearCachedPlans,
  MAX_CACHED_PLANS,
  planEvent,
  planEventLevel,
  planSessionKey,
  readCachedPlan,
  writeCachedPlan,
} from "@/lib/scan/planCache";
import { etDateKey } from "@/lib/market/session";
import type { ScanResult } from "@/lib/types";

// 2026-10-27 is a Tuesday; EDT, so 09:30 ET is 13:30 UTC and 16:00 ET is 20:00 UTC.
describe("planSessionKey", () => {
  it("rolls at New York midnight, as the scan's completed sessions do", () => {
    // scanTicker reads sessions before etDateKey(now): after the close the
    // plan still lacks today's bar until midnight, and so does the key.
    expect(planSessionKey("us_equity", new Date("2026-10-27T22:00:00Z"))).toBe("2026-10-27:shut");
    expect(planSessionKey("us_equity", new Date("2026-10-28T03:59:00Z"))).toBe("2026-10-27:shut");
    expect(planSessionKey("us_equity", new Date("2026-10-28T04:00:00Z"))).toBe("2026-10-28:shut");
    expect(planSessionKey("us_equity", new Date("2026-10-28T04:00:00Z"))).toBe(
      `${etDateKey(new Date("2026-10-28T04:00:00Z"))}:shut`,
    );
  });

  it("moves when the regular session opens and closes", () => {
    expect(planSessionKey("us_equity", new Date("2026-10-27T13:29:00Z"))).toBe("2026-10-27:shut");
    expect(planSessionKey("us_equity", new Date("2026-10-27T13:30:00Z"))).toBe("2026-10-27:open");
    expect(planSessionKey("us_equity", new Date("2026-10-27T20:00:00Z"))).toBe("2026-10-27:shut");
  });

  it("stays shut on a holiday", () => {
    // Thanksgiving 2026 is Thursday Nov 26.
    expect(planSessionKey("us_equity", new Date("2026-11-26T16:00:00Z"))).toBe("2026-11-26:shut");
  });

  it("reads crypto on the New York date alone", () => {
    expect(planSessionKey("crypto", new Date("2026-10-28T03:00:00Z"))).toBe("2026-10-27");
    expect(planSessionKey("crypto", new Date("2026-10-28T04:00:00Z"))).toBe("2026-10-28");
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

  it("asks a retired plan again while price is back past its reclaim line", () => {
    const retired = plan({ currentPrice: 96, stopBreach: { stop: 97, price: 96, reclaimAt: 100 } });
    expect(planEvent(retired, 90)).toBeNull();
    expect(planEvent(retired, 99.9)).toBeNull();
    expect(planEvent(retired, 100)).toBe("reclaim");
    expect(planEventLevel(retired, "reclaim")).toBe(100);
    // A scan that already priced it past the line, still breached (no closed
    // bar back through yet), keeps asking: the scan confirms on a closed bar.
    const seen = plan({ currentPrice: 101, stopBreach: { stop: 97, price: 96, reclaimAt: 100 } });
    expect(planEvent(seen, 101)).toBe("reclaim");
  });

  it("reads a stop poked by the day's extreme, not only the last price", () => {
    expect(planEvent(plan(), 101, { high: 102, low: 96.5 })).toBe("stop");
    expect(planEvent(plan(), 101, { high: 102, low: 98 })).toBeNull();
    expect(planEvent(plan(), 101, { high: null, low: null })).toBeNull();
    const short = plan({ direction: "bearish", levels: { entry: 99, stopLoss: 103, takeProfit1: 94, masterProfit: 88 } } as Partial<ScanResult>);
    expect(planEvent(short, 100, { high: 103.2, low: 99 })).toBe("stop");
  });

  it("asks at the Execute cutoff when price passes TP1", () => {
    expect(planEvent(plan({ dayRange: 10 }), 106)).toBe("target");
    expect(planEvent(plan({ dayRange: 10, decision: { outputState: "Watch", score: 6 } } as Partial<ScanResult>), 106)).toBeNull();
  });

  it("asks when the entry's distance crosses a day's range", () => {
    // Scanned within a day's range (|100 - 101| = 1 <= 2); now 4 away.
    expect(planEvent(plan(), 105)).toBe("resting");
  });

  it("asks when price falls back short of TP1 it was scanned past", () => {
    expect(planEvent(plan({ currentPrice: 107, dayRange: 10 }), 105)).toBe("target");
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

  it("files a plan under the session its scan read, not when it returned", () => {
    const stored = writeCachedPlan("SPY", plan({ scannedAt: "2026-10-27T13:29:59Z" }), false, new Date("2026-10-27T13:30:02Z"));
    expect(stored.session).toBe("2026-10-27:shut");
  });

  it("keeps a plan for its session and drops it once the session moves", () => {
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

  it("drops the plans when another member signs in, or nobody is", () => {
    expect(bindCachedPlansTo("member-a")).toBe(false);
    writeCachedPlan("SPY", plan(), false, morning);
    expect(bindCachedPlansTo("member-a")).toBe(false);
    expect(readCachedPlan("SPY", morning)).not.toBeNull();
    expect(bindCachedPlansTo("member-b")).toBe(true);
    expect(readCachedPlan("SPY", morning)).toBeNull();
    writeCachedPlan("SPY", plan(), false, morning);
    expect(bindCachedPlansTo(null)).toBe(true);
    expect(readCachedPlan("SPY", morning)).toBeNull();
  });

  it("clears every plan", () => {
    writeCachedPlan("SPY", plan(), false, morning);
    clearCachedPlans();
    expect(readCachedPlan("SPY", morning)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { computePnl, formatPnl, NEXT_MODE } from "./pnl";

describe("computePnl", () => {
  it("computes a long profit with a multiplier", () => {
    const s = computePnl({
      symbol: "ES",
      qty: 2,
      entryPrice: 5000,
      currentPrice: 5010,
      multiplier: 50,
    });
    expect(s.points).toBe(10);
    expect(s.dollars).toBe(10 * 2 * 50); // 1000
    expect(s.isProfit).toBe(true);
  });

  it("inverts for shorts", () => {
    const s = computePnl({
      symbol: "SPY",
      qty: 100,
      entryPrice: 743.26,
      currentPrice: 740.0,
      side: "SHORT",
    });
    expect(s.isProfit).toBe(true); // price fell, short profits
    expect(s.dollars).toBeCloseTo(3.26 * 100, 5);
  });

  it("formats each cycle mode and cycles correctly", () => {
    const s = computePnl({
      symbol: "SPY",
      qty: 100,
      entryPrice: 743.26,
      currentPrice: 747.46,
    });
    expect(formatPnl(s, "DOLLAR")).toBe("+$420.00");
    expect(formatPnl(s, "PERCENT")).toMatch(/^\+0\.5[0-9]%$/);
    expect(formatPnl(s, "POINTS")).toBe("+4.20 pts");
    expect(NEXT_MODE.DOLLAR).toBe("PERCENT");
    expect(NEXT_MODE.POINTS).toBe("DOLLAR");
  });
});

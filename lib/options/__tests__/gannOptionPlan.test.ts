import { describe, expect, it } from "vitest";
import { gannOptionExpiration, gannOptionStrike, gannOptionType, nearestListedStrike } from "@/lib/options/gannOptionPlan";

describe("the option rules (Master Course Ch. 19A)", () => {
  const from = new Date("2026-10-21T15:00:00Z");
  it("offers the nearest expiration at least 30 days out", () => {
    expect(gannOptionExpiration(["2026-10-23", "2026-10-30", "2026-11-20", "2026-12-18"], from)).toBe("2026-11-20");
  });
  it("falls back to the farthest when none is 30 days out", () => {
    expect(gannOptionExpiration(["2026-10-23", "2026-10-30"], from)).toBe("2026-10-30");
    expect(gannOptionExpiration([], from)).toBeNull();
  });
  it("buys a call for a long and a put for a short, a few points out", () => {
    expect(gannOptionType("bullish")).toBe("call");
    expect(gannOptionStrike(42.5, "call")).toBeCloseTo(45.5, 6);
    expect(gannOptionStrike(42.5, "put")).toBeCloseTo(39.5, 6);
    expect(nearestListedStrike(45.5, [44, 45, 46, 47])).toBe(45);
  });
});

import { describe, expect, it } from "vitest";
import { matchesDirectionalBias, matchesVolatilityTrigger } from "@/lib/automation/portfolio-manager";

describe("matchesDirectionalBias", () => {
  it("BOTH allows either direction", () => {
    expect(matchesDirectionalBias("bullish", "BOTH")).toBe(true);
    expect(matchesDirectionalBias("bearish", "BOTH")).toBe(true);
  });

  it("BULLISH_ONLY blocks a bearish plan", () => {
    expect(matchesDirectionalBias("bullish", "BULLISH_ONLY")).toBe(true);
    expect(matchesDirectionalBias("bearish", "BULLISH_ONLY")).toBe(false);
  });

  it("BEARISH_ONLY blocks a bullish plan", () => {
    expect(matchesDirectionalBias("bearish", "BEARISH_ONLY")).toBe(true);
    expect(matchesDirectionalBias("bullish", "BEARISH_ONLY")).toBe(false);
  });
});

describe("matchesVolatilityTrigger", () => {
  const plan = { entry_trigger: 100, invalidation: 97 };

  it("PERCENTAGE trigger compares stop distance as a % of entry", () => {
    // 3% stop distance
    expect(matchesVolatilityTrigger(plan, "PERCENTAGE", 2)).toBe(true);
    expect(matchesVolatilityTrigger(plan, "PERCENTAGE", 3)).toBe(true);
    expect(matchesVolatilityTrigger(plan, "PERCENTAGE", 4)).toBe(false);
  });

  it("DOLLAR_AMOUNT trigger compares the raw entry-to-stop distance", () => {
    expect(matchesVolatilityTrigger(plan, "DOLLAR_AMOUNT", 2)).toBe(true);
    expect(matchesVolatilityTrigger(plan, "DOLLAR_AMOUNT", 3)).toBe(true);
    expect(matchesVolatilityTrigger(plan, "DOLLAR_AMOUNT", 3.5)).toBe(false);
  });

  it("never divides by zero on a degenerate entry price", () => {
    expect(matchesVolatilityTrigger({ entry_trigger: 0, invalidation: -1 }, "PERCENTAGE", 1)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { isExpiredByBars, isExpiredByClock, withinTriggerTolerance } from "@/lib/lifecycle/expiry";

describe("isExpiredByBars", () => {
  it("expires once the bar count reaches the limit", () => {
    expect(isExpiredByBars(4, 5)).toBe(false);
    expect(isExpiredByBars(5, 5)).toBe(true);
    expect(isExpiredByBars(6, 5)).toBe(true);
  });
});

describe("isExpiredByClock", () => {
  it("compares against the deadline", () => {
    expect(isExpiredByClock("2026-08-29T12:00:00Z", "2026-08-29T13:00:00Z")).toBe(false);
    expect(isExpiredByClock("2026-08-29T13:00:00Z", "2026-08-29T13:00:00Z")).toBe(true);
    expect(isExpiredByClock("2026-08-29T14:00:00Z", "2026-08-29T13:00:00Z")).toBe(true);
  });
});

describe("withinTriggerTolerance", () => {
  it("accepts a long entry inside the tolerance above the trigger", () => {
    expect(withinTriggerTolerance("bullish", 100.4, 100, 0.5)).toBe(true);
    expect(withinTriggerTolerance("bullish", 100.6, 100, 0.5)).toBe(false);
  });

  it("accepts a short entry inside the tolerance below the trigger", () => {
    expect(withinTriggerTolerance("bearish", 99.6, 100, 0.5)).toBe(true);
    expect(withinTriggerTolerance("bearish", 99.4, 100, 0.5)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { isExpiredByBars, isExpiredByClock, sessionCloseDeadline, withinTriggerTolerance } from "@/lib/lifecycle/expiry";

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

// Q17 (owner: "Replace"): a plan's levels are read from completed sessions, so
// it lasts until the close of the session it trades in, when the next read of
// the swing chart replaces it; a broken stop retires it sooner.
describe("sessionCloseDeadline", () => {
  it("ends an equity plan at its session's close", () => {
    expect(sessionCloseDeadline("2026-10-15T14:00:00Z", "us_equity")).toBe("2026-10-15T20:00:00.000Z");
  });
  it("carries a plan made after the close through the next session", () => {
    expect(sessionCloseDeadline("2026-10-15T20:55:00Z", "us_equity")).toBe("2026-10-16T20:00:00.000Z");
    expect(sessionCloseDeadline("2026-10-16T21:00:00Z", "us_equity")).toBe("2026-10-19T20:00:00.000Z");
  });
  it("ends a crypto plan when its daily bar completes", () => {
    expect(sessionCloseDeadline("2026-10-15T20:55:00Z", "crypto")).toBe("2026-10-16T04:00:00.000Z");
  });
});

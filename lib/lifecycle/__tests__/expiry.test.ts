import { describe, expect, it } from "vitest";
import { isExpiredByBars, isExpiredByClock, sessionBarsDeadline, withinTriggerTolerance } from "@/lib/lifecycle/expiry";

describe("sessionBarsDeadline", () => {
  const FIFTEEN = 15 * 60 * 1000;

  it("counts an equity plan's bars from the next open when it is generated after the close", () => {
    // Thu 2026-10-15 16:55 ET (20:55 UTC). The steps keep the :55 phase; the first one opening in
    // the session opens at 09:40 ET, so the fifth closes at 10:55 ET Friday.
    expect(sessionBarsDeadline("2026-10-15T20:55:00Z", 5, FIFTEEN, "us_equity")).toBe("2026-10-16T14:55:00.000Z");
  });

  it("skips the weekend", () => {
    // Fri 2026-10-16 15:30 ET: two bars left Friday, three more Monday from 09:30 ET.
    expect(sessionBarsDeadline("2026-10-16T19:30:00Z", 5, FIFTEEN, "us_equity")).toBe("2026-10-19T14:15:00.000Z");
  });

  it("is plain wall-clock inside a session and for crypto", () => {
    expect(sessionBarsDeadline("2026-10-15T14:00:00Z", 4, FIFTEEN, "us_equity")).toBe("2026-10-15T15:00:00.000Z");
    expect(sessionBarsDeadline("2026-10-15T20:55:00Z", 4, FIFTEEN, "crypto")).toBe("2026-10-15T21:55:00.000Z");
  });
});

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

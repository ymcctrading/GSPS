import { describe, expect, it } from "vitest";
import {
  canEnterNewIntradayPosition,
  isConfirmedIntradayEntry,
  remainingSetupsDisplayable,
  type ProIntradayUsage,
} from "@/lib/promotion/pro-intraday";

const CLEAN: ProIntradayUsage = {
  setupsDisplayedToday: 0,
  entriesToday: 0,
  concurrentOpen: 0,
  consecutiveLosses: 0,
  dailyLossPct: 0,
};

describe("remainingSetupsDisplayable", () => {
  it("returns the full ceiling with nothing shown yet", () => {
    expect(remainingSetupsDisplayable({ setupsDisplayedToday: 0 })).toBe(5);
  });

  it("never goes negative once the ceiling is exceeded", () => {
    expect(remainingSetupsDisplayable({ setupsDisplayedToday: 9 })).toBe(0);
  });
});

describe("canEnterNewIntradayPosition", () => {
  it("allows an entry with clean usage", () => {
    expect(canEnterNewIntradayPosition(CLEAN, 3).allowed).toBe(true);
  });

  it("blocks on the daily loss lock before anything else", () => {
    const decision = canEnterNewIntradayPosition({ ...CLEAN, dailyLossPct: 3.5 }, 3);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/daily loss lock/i);
  });

  it("blocks after the consecutive-loss pause threshold", () => {
    const decision = canEnterNewIntradayPosition({ ...CLEAN, consecutiveLosses: 2 }, 10);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/consecutive/i);
  });

  it("blocks at the concurrent-position ceiling", () => {
    const decision = canEnterNewIntradayPosition({ ...CLEAN, concurrentOpen: 2 }, 10);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/concurrent/i);
  });

  it("blocks at today's entry ceiling", () => {
    const decision = canEnterNewIntradayPosition({ ...CLEAN, entriesToday: 2 }, 10);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/entry-limit|entry limit|2-entry/i);
  });
});

describe("isConfirmedIntradayEntry", () => {
  it("accepts a closed 15-minute bar", () => {
    expect(isConfirmedIntradayEntry(15, true)).toBe(true);
  });

  it("rejects an unclosed bar regardless of interval", () => {
    expect(isConfirmedIntradayEntry(15, false)).toBe(false);
  });

  it("rejects a closed bar of an interval the module doesn't confirm on", () => {
    expect(isConfirmedIntradayEntry(1, true)).toBe(false);
  });
});

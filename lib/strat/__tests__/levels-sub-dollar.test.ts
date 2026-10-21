/**
 * Review finding F-02 (2026-10-21): the non-equity plan rounded every level
 * to cents, so a sub-dollar coin's entry and stop met on the same cent, and a
 * short's projected master target could fall below zero.
 */
import { describe, expect, it } from "vitest";
import { computeTradeLevels, type EntrySource } from "@/lib/strat/levels";
import type { Bar } from "@/lib/types";

const prev = (h: number, l: number): Bar => ({ t: "2026-10-20T00:00:00Z", o: l, h, l, c: l, v: 1 });

describe("crypto plan levels below a dollar", () => {
  it("keeps a sub-dollar coin's entry and stop apart and its risk above zero", () => {
    const long: EntrySource = { direction: "bullish", triggerPrice: 0.1612, stopPrice: 0.1585, gannReaction: true };
    const l = computeTradeLevels(long, prev(0.162, 0.158), [], undefined, undefined, "crypto");
    expect(l.entry).toBe(0.1612);
    expect(l.stopLoss).toBe(0.1585);
    expect(l.riskPerShare).toBeGreaterThan(0);
    expect(l.takeProfit1).toBeGreaterThan(l.entry);
    expect(l.masterProfit).toBeGreaterThan(l.takeProfit1);
  });

  it("puts a short's master on an eighth of the entry, never below zero", () => {
    const short: EntrySource = { direction: "bearish", triggerPrice: 1, stopPrice: 1.35, gannReaction: true };
    const l = computeTradeLevels(short, prev(1.1, 0.9), [], undefined, undefined, "crypto");
    expect(l.takeProfit1).toBeGreaterThan(0);
    expect(l.masterProfit).toBeGreaterThan(0);
    expect(l.masterProfit).toBeLessThan(l.takeProfit1);
    expect((l.masterProfit * 8) % 1).toBeCloseTo(0, 9);
  });

  it("refuses a short with no eighth of the price left beyond its first target", () => {
    // Risk 0.6 on a 1.00 entry: TP1 at 0.10 is already under the last eighth.
    // The original probe: its master read -0.80.
    const short: EntrySource = { direction: "bearish", triggerPrice: 1, stopPrice: 1.6, gannReaction: true };
    expect(() => computeTradeLevels(short, prev(1.1, 0.9), [], undefined, undefined, "crypto")).toThrow(/Invalid trade levels/);
  });
});

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

  // 2026-10-21: crypto takes the same level plan as stocks, so a short's
  // targets are percentages of the entry (at most 30% away) and can no longer
  // be projected below zero from the risk.
  it("keeps a short's targets above zero, the master beyond TP1", () => {
    const short: EntrySource = { direction: "bearish", triggerPrice: 1, stopPrice: 1.35, gannReaction: true };
    const l = computeTradeLevels(short, prev(1.1, 0.9), [], undefined, undefined, "crypto");
    expect(l.takeProfit1).toBeGreaterThan(0);
    expect(l.masterProfit).toBeGreaterThan(0);
    expect(l.masterProfit).toBeLessThan(l.takeProfit1);
  });

  it("prices the original probe above zero, with a first target short of the risk", () => {
    // Risk 0.6 on a 1.00 entry: its master once read -0.80. No level in reach
    // pays that risk, so TP1 sits inside it and M-K5 holds the plan from Execute.
    const short: EntrySource = { direction: "bearish", triggerPrice: 1, stopPrice: 1.6, gannReaction: true };
    const l = computeTradeLevels(short, prev(1.1, 0.9), [], undefined, undefined, "crypto");
    expect(l.masterProfit).toBeGreaterThan(0);
    expect(l.rewardToRiskTp1).toBeLessThan(1);
  });
});

describe("a named market's rounded plan is checked (review of #405)", () => {
  it("refuses a crypto plan whose stop rounds onto its entry", () => {
    const flat: EntrySource = { direction: "bullish", triggerPrice: 30.004, stopPrice: 30.001, gannReaction: true };
    expect(() => computeTradeLevels(flat, prev(30.01, 29.99), [], undefined, undefined, "crypto")).toThrow(/not a priced bullish plan/);
  });

  it("refuses a stock plan whose stop is not beyond the entry", () => {
    const wrongSide: EntrySource = { direction: "bullish", triggerPrice: 50, stopPrice: 51, gannReaction: true };
    expect(() => computeTradeLevels(wrongSide, prev(51, 49), [], undefined, undefined, "us_equity")).toThrow(/not a priced bullish plan/);
  });
});

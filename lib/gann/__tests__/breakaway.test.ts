import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { readBreakaway } from "../breakaway";
import { computeGannEntryTrigger } from "../entryTrigger";
import { applyBreakawayHold } from "@/lib/scoring/score";
import type { ScanDecision } from "@/lib/types";

/** One bar per calendar day from 2026-01-01; each bar spans close ± 0.5. */
function daily(closes: number[]): Bar[] {
  return closes.map((c, i) => ({
    t: new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString(),
    o: c,
    h: c + 0.5,
    l: c - 0.5,
    c,
    v: 1000,
  }));
}

/** A sideways market: swings between ~95 and ~105 with no net progress. */
function sideways(cycles: number): number[] {
  const out: number[] = [];
  for (let k = 0; k < cycles; k++) {
    // Tops alternate slightly so the highest top is an older one.
    const top = k % 2 === 0 ? 105 : 103;
    for (let i = 1; i <= 5; i++) out.push(95 + ((top - 95) * i) / 5);
    for (let i = 1; i <= 5; i++) out.push(top - ((top - 95) * i) / 5);
  }
  return out;
}

function steppingAdvance(cycles: number): number[] {
  const out: number[] = [];
  let p = 100;
  for (let k = 0; k < cycles; k++) {
    for (let i = 0; i < 6; i++) out.push((p += 1));
    for (let i = 0; i < 3; i++) out.push((p -= 0.5));
  }
  return out;
}

describe("readBreakaway (Commodities pp. 51-52)", () => {
  it("reads a sideways market as range-bound and holds an entry inside the range", () => {
    const bars = daily([...sideways(6), 97, 99, 101, 103, 102, 101, 100]);
    const trigger = computeGannEntryTrigger(bars, "bullish");
    const r = readBreakaway(bars, trigger);
    expect(r.rangeBound).toBe(true);
    expect(trigger).not.toBeNull();
    expect(trigger!.triggerPrice).toBeLessThan(r.rangeHigh!);
    expect(r.breaksAway).toBe(false);
  });

  it("allows an entry that crosses the top of the range", () => {
    const bars = daily(sideways(6));
    const r = readBreakaway(bars, {
      direction: "bullish",
      triggerPrice: 200,
      stopPrice: 90,
      pivot: { index: 0, price: 199, kind: "top" },
      protectivePivot: { index: 1, price: 91, kind: "bottom" },
      swingDays: 3,
    });
    expect(r.rangeBound).toBe(true);
    expect(r.breaksAway).toBe(true);
  });

  it("does not apply in a confirmed trend", () => {
    const bars = daily(steppingAdvance(8));
    const r = readBreakaway(bars, computeGannEntryTrigger(bars, "bullish"));
    expect(r.rangeBound).toBe(false);
    expect(r.breaksAway).toBe(true);
  });
});

describe("applyBreakawayHold", () => {
  const execute = { outputState: "Execute", breakdown: [] } as unknown as ScanDecision;

  it("holds a range-bound Execute that does not break away", () => {
    const held = applyBreakawayHold(execute, { rangeBound: true, rangeHigh: 105, rangeLow: 95, breaksAway: false });
    expect(held.outputState).toBe("Watch");
    expect(held.breakdown.at(-1)?.key).toBe("breakaway");
  });

  it("leaves a breakaway, a trend, or a non-Execute verdict alone", () => {
    expect(applyBreakawayHold(execute, { rangeBound: true, rangeHigh: 105, rangeLow: 95, breaksAway: true })).toBe(execute);
    expect(applyBreakawayHold(execute, { rangeBound: false, rangeHigh: null, rangeLow: null, breaksAway: true })).toBe(execute);
    const watch = { ...execute, outputState: "Watch" } as ScanDecision;
    expect(applyBreakawayHold(watch, { rangeBound: true, rangeHigh: 105, rangeLow: 95, breaksAway: false })).toBe(watch);
  });
});

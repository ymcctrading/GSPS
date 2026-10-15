/**
 * Gann's 3 points on the entry side (PLAN.md item 3; owner, 2026-10-15: "Use
 * Gann's full 3 points now"). Every surface that clears or stops beyond a
 * level uses `gannThreePoints(level)`, the price-scaled figure the exits
 * already use, not the old fixed 0.3%.
 *
 * W006 pp.20-24, 46-47: buy on crossing an old top by 3 points, sell short on
 * breaking an old bottom by 3 points, stops 3 points beyond the level.
 */

import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { computeGannEntryTrigger } from "@/lib/gann/entryTrigger";
import { gannThreePoints, levelBeforeThreePoints } from "@/lib/gann/pointScale";
import { advanceEntryConfirmation, freshEntryConfirmation } from "@/lib/lifecycle/entryConfirmation";
import { readTimeRules } from "@/lib/gann/timeRules";
import { readMultipleTops } from "@/lib/gann/multipleTops";
import { readAccumulation } from "@/lib/gann/accumulation";
import { readPyramidAdd } from "@/lib/gann/pyramid";
import { stopBeyondFigure } from "@/lib/gann/evenFigures";
import { computeEquityTradeLevels } from "@/lib/strat/levels";

function bars(closes: number[], half = 0.5, start = "2026-01-01"): Bar[] {
  const t0 = Date.parse(`${start}T00:00:00Z`);
  return closes.map((c, i) => ({ t: new Date(t0 + i * 86_400_000).toISOString(), o: c, h: c + half, l: c - half, c, v: 1e6 }));
}

const ZIGZAG = bars([10, 11, 12, 13, 14, 15, 16, 15, 14, 13, 12, 13, 14, 15, 16, 17, 18].map((c) => c * 4), 1);

describe("3 points on the entry side", () => {
  it("crosses the old top by 3 points and stops 3 points beyond the protective bottom", () => {
    const t = computeGannEntryTrigger(ZIGZAG, "bullish")!;
    expect(t.triggerPrice).toBeCloseTo(t.pivot.price + gannThreePoints(t.pivot.price), 8);
    expect(t.stopPrice).toBeCloseTo(t.protectivePivot.price - gannThreePoints(t.protectivePivot.price), 8);
  });

  it("breaks the old bottom by 3 points for a short, the exact mirror", () => {
    const t = computeGannEntryTrigger(ZIGZAG, "bearish")!;
    expect(t.triggerPrice).toBeCloseTo(t.pivot.price - gannThreePoints(t.pivot.price), 8);
    expect(t.stopPrice).toBeCloseTo(t.protectivePivot.price + gannThreePoints(t.protectivePivot.price), 8);
  });

  it("counts the 3 points once: a close beyond the trigger is the break, with no second allowance", () => {
    const rule = { direction: "bullish" as const, entryTrigger: 100 };
    const day = (d: number, h: number, l: number, c: number): Bar => ({ t: `2026-01-0${d}T00:00:00Z`, o: c, h, l, c, v: 1 });
    let ev = advanceEntryConfirmation(freshEntryConfirmation(), rule, day(1, 100.2, 99, 99.5));
    ev = advanceEntryConfirmation(ev, rule, day(2, 100.6, 99.8, 100.05));
    expect(ev.breakOrSweepAt).toBe("2026-01-02T00:00:00Z");
  });

  it("puts a 2-3 day halt's stop 3 points beyond the extreme", () => {
    const closes = [...Array.from({ length: 22 }, (_, i) => 100 + i), 120.5, 120.2];
    const r = readTimeRules(bars(closes), null);
    expect(r.halt?.at).toBe("top");
    expect(r.halt!.stop).toBeCloseTo(r.halt!.extreme + gannThreePoints(r.halt!.extreme), 8);
  });

  it("does not read a triple top as crossed until a close clears it by 3 points", () => {
    const leg = (from: number, to: number, n: number) => Array.from({ length: n }, (_, i) => from + ((to - from) * (i + 1)) / n);
    const base = [...leg(100, 110, 6), ...leg(110, 102, 5), ...leg(102, 110, 6), ...leg(110, 102, 5), ...leg(102, 110, 6), ...leg(110, 103, 5)];
    // About 2.7% over the ~110.5 tops: beyond the old 0.3%, short of 3 points (~5.3%).
    expect(readMultipleTops(bars([...base, ...leg(103, 113.5, 6)])).top?.state).not.toBe("crossed");
    expect(readMultipleTops(bars([...base, ...leg(103, 118, 6)])).top?.state).toBe("crossed");
  });

  it("reads an accumulation breakout only on a close 3 points beyond the range", () => {
    const flat = Array.from({ length: 90 }, (_, i) => 100 + (i % 4) - 1.5);
    // Range high 102; 3 points there is about 5.1 points.
    expect(readAccumulation(bars([...flat, 106]))?.breakout).toBeNull();
    expect(readAccumulation(bars([...flat, 108]))?.breakout).toBe("up");
  });

  it("adds a pyramid lot only once the new swing top is crossed by 3 points", () => {
    const daily = bars([100, 101, 102, 104, 106, 108, 110, 109, 107, 105, 104, 106, 108, 117], 0.5, "2026-06-01");
    const r = readPyramidAdd({ side: "long", lots: [{ qty: 100, price: 102, date: "2026-06-03" }], stop: 90, initialStop: 90, daily, price: 117 });
    expect(r.add).not.toBeNull();
    expect(r.add!.trigger).toBeCloseTo(110.5 + gannThreePoints(110.5), 8);
  });

  it("moves a stop resting inside a round number 3 points beyond it", () => {
    expect(stopBeyondFigure(110, 100.4, "bullish", 15)).toBeCloseTo(100 - gannThreePoints(100), 8);
    expect(stopBeyondFigure(95, 99.6, "bearish", 15)).toBeCloseTo(100 + gannThreePoints(100), 8);
  });

  it("places a structural equity stop 3 points beyond the support it rests on", () => {
    const r = computeEquityTradeLevels({ direction: "bullish", entry: 100, structuralLevels: [93.3], evenFigures: false });
    expect(r.stopFromStructure).toBe(true);
    expect(r.stopLoss).toBeCloseTo(93.3 - gannThreePoints(93.3), 2);
  });

  it("recovers the crossed level from a trigger that carries the 3 points", () => {
    for (const level of [12, 42.5, 99.9, 250, 60_000]) {
      expect(levelBeforeThreePoints(level + gannThreePoints(level), "bullish")).toBeCloseTo(level, 6);
      expect(levelBeforeThreePoints(level - gannThreePoints(level), "bearish")).toBeCloseTo(level, 6);
    }
  });
});

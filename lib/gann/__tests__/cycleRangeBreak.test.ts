/**
 * C-TIME-03 (Additional Cycle Findings, W003 p.16, class C; the trigger is not
 * found in the method's own text): time cycles act as vertical angles, and
 * after 3-4 sideways days a high-volume down day that breaks the range at the
 * expiry of a time cycle is a short setup. Built as one combined context
 * reading; it places nothing.
 */
import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { readCycleRangeBreak } from "@/lib/gann/cycleRangeBreak";
import { describeDisclosedRules, readDisclosedRules } from "@/lib/gann/disclosedRules";
import { contextFactorsFor } from "@/lib/gann/contextFactors";

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 2, 2, 15);
function bar(i: number, o: number, h: number, l: number, c: number, v: number): Bar {
  return { t: new Date(T0 + i * DAY).toISOString(), o, h, l, c, v };
}
/** 25 quiet rising days, 4 sideways days, then the given last bar. */
function series(last: { c: number; o: number; v: number }): Bar[] {
  const out: Bar[] = [];
  for (let i = 0; i < 25; i++) out.push(bar(i, 90 + i * 0.4, 91 + i * 0.4, 89 + i * 0.4, 90 + i * 0.4, 1000));
  for (let i = 25; i < 29; i++) out.push(bar(i, 100, 101, 99, 100 + (i % 2 ? 0.3 : -0.3), 1000));
  out.push(bar(29, last.o, Math.max(last.o, last.c) + 0.2, last.c - 0.2, last.c, last.v));
  return out;
}

describe("a range break at a cycle's expiry (C-TIME-03)", () => {
  it("reads a 4-day range broken downward on heavy volume on an active cycle date as a short setup", () => {
    const r = readCycleRangeBreak(series({ o: 99.5, c: 97, v: 2500 }), true);
    expect(r).toMatchObject({ rangeDays: 4, onCycleDate: true, shortSetup: true });
    expect(r!.volumeRatio).toBeCloseTo(2.5, 5);
  });

  it("does not read the same break off a cycle date as a setup", () => {
    const r = readCycleRangeBreak(series({ o: 99.5, c: 97, v: 2500 }), false);
    expect(r).toMatchObject({ rangeDays: 4, onCycleDate: false, shortSetup: false });
  });

  it("needs the volume and a close under the range", () => {
    expect(readCycleRangeBreak(series({ o: 99.5, c: 97, v: 1100 }), true)?.shortSetup ?? false).toBe(false);
    expect(readCycleRangeBreak(series({ o: 100, c: 99.4, v: 2500 }), true)).toBeNull();
  });

  it("is read on every scan and shown for context", () => {
    const bars = series({ o: 99.5, c: 97, v: 2500 });
    const ctx = readDisclosedRules(bars, 97, null, new Date(bars[bars.length - 1].t));
    expect(ctx.cycleRangeBreak?.rangeDays).toBe(4);
    const f = contextFactorsFor(ctx, "bearish", 97);
    expect(f.cycleRangeBreakShort).toBe(ctx.cycleRangeBreak!.shortSetup);
    expect(contextFactorsFor(ctx, "bullish", 97).cycleRangeBreakShort).toBeUndefined();
    expect(describeDisclosedRules(ctx).some((l) => /sideways days/.test(l) && /Shown for context/.test(l))).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import {
  SIDE,
  extremeBarBreaks,
  fanBreaks,
  fanFitBreaks,
  majorHighs,
  scoreSignals,
  seeded,
  type DayBar,
} from "@/lib/research/shortsPriceRules";

const day = (i: number) => new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10);
const bar = (i: number, c: number, spread = 1): DayBar => ({ t: day(i), h: c + spread, l: c - spread, c });

/** A rise to a top at index `top`, then a fall, then flat. */
function rampSeries(top: number, len: number, step = 1): DayBar[] {
  return Array.from({ length: len }, (_, i) => bar(i, i <= top ? 100 + i * step : 100 + top * step - (i - top) * step));
}

describe("extremeBarBreaks", () => {
  it("fires on the first close below the highest bar's low, not before", () => {
    const bars = rampSeries(30, 60);
    const sig = extremeBarBreaks(bars, "top");
    // Top bar 30: high 131, low 129. Closes 129 at 31, 128 at 32: 32 is the first close under 129.
    expect(sig.map((s) => s.index)).toContain(32);
    expect(sig.every((s) => s.direction === -1)).toBe(true);
    expect(sig.find((s) => s.index <= 31)).toBeUndefined();
  });

  it("mirrors at a bottom", () => {
    const bars = rampSeries(30, 60).map((b) => ({ t: b.t, h: 300 - b.l, l: 300 - b.h, c: 300 - b.c }));
    const sig = extremeBarBreaks(bars, "bottom");
    expect(sig.map((s) => s.index)).toContain(32);
    expect(sig.every((s) => s.direction === 1)).toBe(true);
  });

  it("needs the bar to be the highest of the SIDE sessions before it", () => {
    const flat = Array.from({ length: 80 }, (_, i) => bar(i, 100));
    expect(extremeBarBreaks(flat, "top")).toEqual([]);
  });
});

describe("fan rules", () => {
  // A top at 40, a slow fall of a fifth of a point a session, then a sharp rally.
  const bars: DayBar[] = Array.from({ length: 140 }, (_, i) => {
    if (i <= 40) return bar(i, 50 + i * 0.5, 0.2);
    if (i <= 90) return bar(i, 70 - (i - 40) * 0.4, 0.2);
    return bar(i, 50 + (i - 90) * 0.6, 0.2);
  });

  it("finds the major high", () => {
    expect(majorHighs(bars)).toContain(40);
  });

  it("never signals before the high is known (no look-ahead)", () => {
    for (const s of [...fanBreaks(bars), ...fanFitBreaks(bars)]) expect(s.index).toBeGreaterThanOrEqual(40 + SIDE);
  });

  it("fanFit signals once the rally crosses the fitted 2x1", () => {
    const sig = fanFitBreaks(bars);
    expect(sig.length).toBe(1);
    expect(sig[0].index).toBeGreaterThan(90);
    expect(sig[0].direction).toBe(1);
  });
});

describe("scoreSignals", () => {
  it("is deterministic and scores in the signal's direction", () => {
    const bars = Array.from({ length: 300 }, (_, i) => bar(i, 100 + Math.sin(i / 5) * 10));
    const sig = extremeBarBreaks(bars, "top");
    const a = scoreSignals("topBreak", "t", bars, sig, 5, 500);
    const b = scoreSignals("topBreak", "t", bars, sig, 5, 500);
    expect(a).toEqual(b);
    expect(a.p).toBeGreaterThan(0);
    expect(a.p).toBeLessThanOrEqual(1);
  });

  it("returns NaN with no signals rather than a p of 1/(draws+1)", () => {
    const bars = Array.from({ length: 50 }, (_, i) => bar(i, 100));
    const s = scoreSignals("fanBreak", "t", bars, [], 5, 100);
    expect(s.signals).toBe(0);
    expect(Number.isNaN(s.p)).toBe(true);
  });

  it("seeded() repeats", () => {
    const r1 = seeded(7);
    const r2 = seeded(7);
    expect([r1(), r1(), r1()]).toEqual([r2(), r2(), r2()]);
  });
});

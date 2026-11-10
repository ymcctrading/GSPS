import { describe, expect, it } from "vitest";
import { breakEvenRate, tallyGoodCalls, walkGoodCall } from "@/lib/shadow/goodCall";
import type { Bar } from "@/lib/types";

const bar = (o: number, h: number, l: number, c: number, i = 0): Bar => ({
  t: new Date(Date.UTC(2026, 10, 2 + i)).toISOString(),
  o,
  h,
  l,
  c,
  v: 1000,
});

describe("walkGoodCall (owner's examples, 2026-11-10)", () => {
  it("in at 92, up to TP1 95 before falling to 89: a good call", () => {
    const bars = [bar(92, 93, 91, 92.5, 0), bar(93, 95.2, 92, 94, 1), bar(94, 94, 88.5, 89, 2)];
    expect(walkGoodCall({ long: true, fill: 92, stop: 90, tp1: 95, bars })).toBe("good");
  });

  it("in at 92, down to 89 first: a bad call", () => {
    const bars = [bar(92, 92.5, 91, 91.5, 0), bar(91, 91.2, 89, 89.5, 1), bar(89.5, 96, 89.4, 95, 2)];
    expect(walkGoodCall({ long: true, fill: 92, stop: 90, tp1: 95, bars })).toBe("bad");
  });

  it("a bar touching both is a bad call", () => {
    expect(walkGoodCall({ long: true, fill: 92, stop: 90, tp1: 95, bars: [bar(92, 96, 89, 93)] })).toBe("bad");
  });

  it("the fill bar counts, both ways", () => {
    expect(walkGoodCall({ long: true, fill: 92, stop: 90, tp1: 95, bars: [bar(92, 95, 91, 94)] })).toBe("good");
    expect(walkGoodCall({ long: true, fill: 92, stop: 90, tp1: 95, bars: [bar(92, 93, 90, 91)] })).toBe("bad");
  });

  it("neither touched is open", () => {
    expect(walkGoodCall({ long: true, fill: 92, stop: 90, tp1: 95, bars: [bar(92, 94, 91, 93)] })).toBe("open");
    expect(walkGoodCall({ long: true, fill: 92, stop: 90, tp1: 95, bars: [] })).toBe("open");
  });

  it("short side mirrors", () => {
    const bars = [bar(50, 51, 49, 49.5, 0), bar(49.5, 49.6, 46.9, 47, 1)];
    expect(walkGoodCall({ long: false, fill: 50, stop: 52, tp1: 47, bars })).toBe("good");
    expect(walkGoodCall({ long: false, fill: 50, stop: 52, tp1: 47, bars: [bar(50, 52, 49, 51)] })).toBe("bad");
  });

  it("a malformed card (TP1 not beyond the fill, or NaN) is a bad call", () => {
    expect(walkGoodCall({ long: true, fill: 92, stop: 90, tp1: 91, bars: [bar(92, 99, 91.5, 98)] })).toBe("bad");
    expect(walkGoodCall({ long: true, fill: 92, stop: 93, tp1: 95, bars: [bar(92, 99, 91.5, 98)] })).toBe("bad");
    expect(walkGoodCall({ long: true, fill: Number.NaN, stop: 90, tp1: 95, bars: [bar(92, 99, 91.5, 98)] })).toBe("bad");
  });
});

describe("breakEvenRate", () => {
  it("is risk / (risk + reward)", () => {
    expect(breakEvenRate(92, 89, 95)).toBeCloseTo(0.5);
    expect(breakEvenRate(92, 91, 95)).toBeCloseTo(0.25);
    expect(breakEvenRate(50, 52, 47)).toBeCloseTo(0.4);
  });
  it("is null with no risk or no reward", () => {
    expect(breakEvenRate(92, 92, 95)).toBeNull();
    expect(breakEvenRate(92, 90, 92)).toBeNull();
  });
});

describe("tallyGoodCalls", () => {
  it("counts no-fills and open calls apart and prices each decided call in R", () => {
    const t = tallyGoodCalls([
      { call: "good", fill: 92, stop: 91, tp1: 95 }, // +3R, break-even 0.25
      { call: "bad", fill: 92, stop: 89, tp1: 95 }, // -1R, break-even 0.5
      { call: "no_fill", fill: null, stop: 89, tp1: 95 },
      { call: "open", fill: 92, stop: 89, tp1: 95 },
    ]);
    expect(t).toMatchObject({ calls: 4, noFill: 1, good: 1, bad: 1, open: 1, unresolved: 0, goodRate: 0.5 });
    // Break-even is averaged over every fill, the open one too, as the held-out read averages it.
    expect(t.breakEven).toBeCloseTo((0.25 + 0.5 + 0.5) / 3);
    expect(t.expectancyR).toBeCloseTo(1);
  });
  it("keeps unresolved calls out of the rate but in the break-even, as open ones", () => {
    const t = tallyGoodCalls([
      { call: "good", fill: 92, stop: 91, tp1: 95 },
      { call: "unresolved", fill: 92, stop: 89, tp1: 95 },
    ]);
    expect(t).toMatchObject({ calls: 2, good: 1, bad: 0, unresolved: 1, goodRate: 1 });
    expect(t.breakEven).toBeCloseTo((0.25 + 0.5) / 2);
    expect(t.expectancyR).toBeCloseTo(3);
  });
  it("is empty-safe", () => {
    expect(tallyGoodCalls([])).toMatchObject({ calls: 0, goodRate: null, breakEven: null, expectancyR: null });
  });
});

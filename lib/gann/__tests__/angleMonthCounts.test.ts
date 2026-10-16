import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import {
  ANGLE_MONTH_COUNTS,
  STARRED_ANGLES_DEG,
  STARRED_MONTH_COUNTS,
  monthsElapsed,
  angleMonthCounts,
  monthCountsToTurn,
  readMonthCounts,
} from "../angleMonthCounts";

function bar(t: string, price: number): Bar {
  return { t, o: price, h: price, l: price, c: price, v: 1000 };
}

describe("ANGLE_MONTH_COUNTS", () => {
  it("reproduces the disclosed 1/32 division of 360 in 11.25 steps", () => {
    const values = ANGLE_MONTH_COUNTS.map((a) => a.degrees);
    for (const expected of [11.25, 22.5, 33.75, 45, 56.25, 67.5, 78.75, 90, 360]) {
      expect(values).toContain(expected);
    }
  });

  it("stars exactly the source's 12 named 'very important' angles", () => {
    const starred = ANGLE_MONTH_COUNTS.filter((a) => a.starred).map((a) => a.degrees).sort((a, b) => a - b);
    expect(starred).toEqual([...STARRED_ANGLES_DEG].sort((a, b) => a - b));
  });

  it("includes starred angles that are not on the 11.25 grid (60, 120, 240, 300)", () => {
    const values = ANGLE_MONTH_COUNTS.map((a) => a.degrees);
    for (const off of [60, 120, 240, 300]) {
      expect(values).toContain(off);
      expect(ANGLE_MONTH_COUNTS.find((a) => a.degrees === off)?.starred).toBe(true);
    }
  });

  it("reads degrees as months 1-for-1", () => {
    for (const entry of ANGLE_MONTH_COUNTS) {
      expect(entry.months).toBe(entry.degrees);
    }
  });

  it("STARRED_MONTH_COUNTS is exactly the starred subset", () => {
    expect(STARRED_MONTH_COUNTS.length).toBe(STARRED_ANGLES_DEG.length);
    expect(STARRED_MONTH_COUNTS.every((a) => a.starred)).toBe(true);
  });
});

describe("monthsElapsed — the 1896-1935 DJIA case study arithmetic", () => {
  it("August 1896 bottom to November 1907 low is exactly 135 months", () => {
    expect(monthsElapsed(new Date(Date.UTC(1896, 7, 1)), new Date(Date.UTC(1907, 10, 1)))).toBe(135);
  });

  it("a 1909 top to September 1929's top is exactly 240 months (20 years)", () => {
    expect(monthsElapsed(new Date(Date.UTC(1909, 8, 1)), new Date(Date.UTC(1929, 8, 1)))).toBe(240);
  });
});

describe("angleMonthCounts", () => {
  function barsWithPivot(): Bar[] {
    const closes = [
      100, 98, 96, 94, 92, 90, 92, 94, 96, 98, 100, 105, 108, 110, 112, 114, 116, 118, 120, 122, 124, 126,
      128, 130, 132, 134, 136, 138, 140, 142, 144,
    ];
    return closes.map((c, i) => bar(`2020-01-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`, c));
  }

  it("returns inactive with too little history", () => {
    expect(angleMonthCounts(barsWithPivot().slice(0, 10))).toEqual({ active: false, dates: [] });
  });

  it("projects a starred-only window by default and a wider one with includeUnstarred", () => {
    const bars = barsWithPivot();
    const asOf = new Date("2020-02-01T00:00:00Z");
    const starredOnly = angleMonthCounts(bars, asOf, 2, false);
    const withUnstarred = angleMonthCounts(bars, asOf, 2, true);
    expect(Array.isArray(starredOnly.dates)).toBe(true);
    expect(Array.isArray(withUnstarred.dates)).toBe(true);
  });
});

describe("month counts from every prior pivot to the turn (A-TIME-21, W046 p.2; A-TIME-05, W006 p.15)", () => {
  it("reads the 19 March 1954 coffee high as 9, 2, 6 and 5 months from its prior pivots", () => {
    const pivots = [
      { t: "1953-06-19T00:00:00Z", kind: "low" as const, price: 1 },
      { t: "1953-09-15T00:00:00Z", kind: "low" as const, price: 1 },
      { t: "1953-10-19T00:00:00Z", kind: "high" as const, price: 1 },
      { t: "1954-01-19T00:00:00Z", kind: "low" as const, price: 1 },
    ];
    const counts = monthCountsToTurn(pivots, new Date("1954-03-19T00:00:00Z"));
    const by = (t: string) => counts.find((c) => c.pivotMonth === t.slice(0, 7))?.months;
    expect(by("1953-06")).toBe(9);
    expect(by("1954-01")).toBe(2);
    expect(by("1953-09")).toBe(6);
    expect(by("1953-10")).toBe(5);
    // Most recent pivot first; a pivot in the turn's own month or later is not counted.
    expect(counts.map((c) => c.months)).toEqual([2, 5, 6, 9]);
    expect(monthCountsToTurn([{ t: "1954-03-02T00:00:00Z", kind: "low", price: 1 }], new Date("1954-03-19T00:00:00Z"))).toEqual([]);
  });

  it("marks the counts on the six-month steps from 18 to 48 months", () => {
    const counts = monthCountsToTurn(
      [18, 19, 24, 36, 48, 54].map((m) => ({ t: new Date(Date.UTC(2020, 12 - m, 10)).toISOString(), kind: "low" as const, price: 1 })),
      new Date(Date.UTC(2020, 12, 10)),
    );
    expect(counts.map((c) => [c.months, c.watched])).toEqual([[18, true], [19, false], [24, true], [36, true], [48, true], [54, false]]);
  });

  it("reads the counts from the major pivots of the monthly chart", () => {
    // Monthly swings: a low in month 6 and a high in month 18 of 2019-2021.
    const closes = [...Array(36)].map((_, i) => 100 + 20 * Math.sin(((i - 12) / 24) * 2 * Math.PI));
    const monthly = closes.map((c, i) => ({ ...bar(new Date(Date.UTC(2019, i, 1)).toISOString(), c), h: c + 1, l: c - 1 }));
    const r = readMonthCounts(monthly, new Date(Date.UTC(2021, 11, 15)));
    expect(r).not.toBeNull();
    expect(r!.length).toBeGreaterThan(0);
    for (const c of r!) expect(c.months).toBe(monthsElapsed(new Date(`${c.pivotMonth}-01T00:00:00Z`), new Date(Date.UTC(2021, 11, 15))));
    expect(readMonthCounts(monthly.slice(0, 20), new Date(Date.UTC(2020, 8, 15)))).toBeNull();
  });
});

describe("month counts on the setup", () => {
  it("are read from the stock's monthly bars on every scan, shown for context and measured", async () => {
    const { readDisclosedRules, describeDisclosedRules } = await import("@/lib/gann/disclosedRules");
    const { contextFactorsFor } = await import("@/lib/gann/contextFactors");
    // A monthly low 24 months before the session (a watched count), inside a wave.
    const closes = [...Array(48)].map((_, i) => 100 + 20 * Math.sin(((i - 6) / 24) * 2 * Math.PI));
    const monthly = closes.map((c, i) => ({ ...bar(new Date(Date.UTC(2020, i, 1)).toISOString(), c), h: c + 1, l: c - 1 }));
    const daily = Array.from({ length: 60 }, (_, i) => bar(new Date(Date.UTC(2023, 11, 1 + i)).toISOString(), 100 + Math.sin(i / 3)));
    const asOf = new Date(daily[daily.length - 1].t);
    const ctx = readDisclosedRules(daily, 100, { sharesOutstanding: null, inception: null, monthly }, asOf);
    expect(ctx.monthCounts!.length).toBeGreaterThan(0);
    const watchedLow = ctx.monthCounts!.find((c) => c.watched && c.kind === "low");
    expect(watchedLow).toBeDefined();
    expect(describeDisclosedRules(ctx).some((l) => l.startsWith("Months from the major tops and bottoms:") && l.includes(`${watchedLow!.months} (a watched count) from the ${watchedLow!.pivotMonth} bottom`))).toBe(true);
    expect(contextFactorsFor(ctx, "bullish", 100).watchedMonthCountWithTrade).toBe(true);
    expect(contextFactorsFor(ctx, "bearish", 100).watchedMonthCountWithTrade).toBe(ctx.monthCounts!.some((c) => c.watched && c.kind === "high"));
    // A watched count from a bottom argues up, so it is not with a short.
    const onlyLow = { ...ctx, monthCounts: [watchedLow!] };
    expect(contextFactorsFor(onlyLow, "bullish", 100).watchedMonthCountWithTrade).toBe(true);
    expect(contextFactorsFor(onlyLow, "bearish", 100).watchedMonthCountWithTrade).toBe(false);
    expect(readDisclosedRules(daily, 100, null, asOf).monthCounts).toBeNull();
  });
});

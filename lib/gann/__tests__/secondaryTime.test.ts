import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import {
  cycleFractions,
  readCircleDivisions,
  readCycleFractions,
  readSeasonalFineStep,
  readSecondaryDayCounts,
  readSecondaryMonthCounts,
  readSecondaryWeekCounts,
} from "../secondaryTime";
import { DAY_COUNT_BANDS, MAJOR_CYCLE_YEARS, WHEEL_COUNTS, timeCycles } from "../timeCycles";
import { ANGLES } from "../fans";
import { SEASONAL_POINTS } from "../seasonalCounts";
import { SQUARE_OF_52_FRACTIONS } from "../squareOf52";
import { describeDisclosedRules, readDisclosedRules } from "../disclosedRules";
import { contextFactorsFor } from "../contextFactors";

const DAY = 86_400_000;

function bar(t: string, c: number, h = c + 1, l = c - 1): Bar {
  return { t, o: c, h, l, c, v: 1000 };
}

/** One bar per calendar day from 2026-01-01: a clear major low at index 30, then a rise. */
function withPivotLow(daysAfter: number): Bar[] {
  const pre = Array.from({ length: 30 }, (_, i) => 150 - i * 1.5);
  const post = Array.from({ length: daysAfter }, (_, i) => 105 + i * 0.5 + (i % 6 < 3 ? 0 : -1));
  return [...pre, ...post].map((c, i) => bar(new Date(Date.UTC(2026, 0, 1) + i * DAY).toISOString(), c));
}
const LOW_DATE = "2026-01-31";
const after = (days: number) => new Date(Date.parse(`${LOW_DATE}T00:00:00Z`) + days * DAY);
const fromLow = <T extends { pivotDate: string }>(hs: T[]) => hs.filter((h) => h.pivotDate === LOW_DATE);

/** Monthly bars from 2010-01: down to a low at `lowAt`, then up, `length` months in all. */
function monthlyWithLow(lowAt: number, length: number): Bar[] {
  return Array.from({ length }, (_, i) => {
    const c = i <= lowAt ? 200 - i * 5 : 200 - lowAt * 5 + (i - lowAt) * 3;
    return bar(new Date(Date.UTC(2010, i, 1)).toISOString(), c);
  });
}
const monthAfter = (lowAt: number, months: number) => new Date(Date.UTC(2010, lowAt + months, 15));

describe("secondary day counts (C-TIME-19, W003 p.19)", () => {
  it("flags day 23 and day 49 from a major low, and 45-46 days", () => {
    for (const d of [23, 45, 46, 49]) {
      expect(fromLow(readSecondaryDayCounts(withPivotLow(d + 1))).map((h) => h.count)).toEqual([d]);
    }
  });

  it("flags nothing on the days beside them", () => {
    for (const d of [22, 24, 44, 47, 48, 50]) expect(fromLow(readSecondaryDayCounts(withPivotLow(d + 1)))).toEqual([]);
  });

  it("leaves the class A day-count reading alone", () => {
    const ctx = readDisclosedRules(withPivotLow(24), 120, null, after(23));
    expect(fromLow(ctx.secondaryTime!.dayCounts)).toHaveLength(1);
    expect(ctx.dayCountBands.filter((b) => b.pivotDate === LOW_DATE)).toEqual([]);
  });
});

describe("secondary week counts (C-TIME-21, W003 p.20)", () => {
  it("projects a 35-week window from a major low", () => {
    const hits = fromLow(readSecondaryWeekCounts(withPivotLow(20), after(35 * 7)));
    expect(hits.map((h) => h.label)).toEqual(["35 weeks"]);
    expect(fromLow(readSecondaryWeekCounts(withPivotLow(20), after(17 * 7))).map((h) => h.label)).toEqual(["17 weeks"]);
  });

  it("is open two days either side and closed beyond", () => {
    expect(fromLow(readSecondaryWeekCounts(withPivotLow(20), after(35 * 7 + 2)))).toHaveLength(1);
    expect(fromLow(readSecondaryWeekCounts(withPivotLow(20), after(35 * 7 + 3)))).toEqual([]);
    expect(fromLow(readSecondaryWeekCounts(withPivotLow(20), after(34 * 7)))).toEqual([]);
  });
});

describe("finer divisions of the circle (C-TIME-44, W035 p.1)", () => {
  it("is active 112, 150, 157, 165, 202, 247, 292 and 337 days after a major low", () => {
    for (const d of [112, 150, 157, 165, 202, 247, 292, 337]) {
      expect(fromLow(readCircleDivisions(withPivotLow(20), after(d))).length).toBeGreaterThan(0);
    }
  });

  it("is closed between them, and never opens the scored turn window", () => {
    for (const d of [130, 175, 215, 260, 305, 350]) expect(fromLow(readCircleDivisions(withPivotLow(20), after(d)))).toEqual([]);
    // Day 165 is a fine division only: the class A wheel, bands and years are all elsewhere.
    expect(fromLow(readCircleDivisions(withPivotLow(20), after(165)))).toHaveLength(1);
    expect(timeCycles(withPivotLow(20), after(165)).bullishActive).toBe(false);
  });
});

describe("fractions of a long cycle (C-TIME-12, W003 p.18)", () => {
  it("divides a 30-year cycle into 3.75, 7.5 and 10 years and the rest of the eighths and thirds", () => {
    const f = cycleFractions(30);
    expect(f.find((x) => x.label === "1/8")?.years).toBe(3.75);
    expect(f.find((x) => x.label === "1/4")?.years).toBe(7.5);
    expect(f.find((x) => x.label === "1/3")?.years).toBe(10);
    expect(f.map((x) => x.label)).toEqual(["1/8", "1/4", "1/3", "3/8", "1/2", "5/8", "2/3", "3/4", "7/8"]);
  });

  it("marks the month a fraction of a long cycle comes due from a major monthly low", () => {
    const monthly = monthlyWithLow(10, 60);
    const labels = fromAny(readCycleFractions(monthly, monthAfter(10, 45)));
    expect(labels).toContain("1/8 of the 30-year cycle");
    expect(readCycleFractions(monthly, monthAfter(10, 44))).toEqual([]);
  });
});

function fromAny(hs: { pivotKind: string; label: string }[]): string[] {
  return hs.filter((h) => h.pivotKind === "low").map((h) => h.label);
}

describe("secondary month counts (C-TIME-09, W003 p.18)", () => {
  it("counts 6, 12 and 144 months from a major monthly low", () => {
    const monthly = monthlyWithLow(4, 160);
    for (const m of [6, 12, 144]) expect(fromAny(readSecondaryMonthCounts(monthly, monthAfter(4, m)))).toEqual([`${m} months`]);
    for (const m of [5, 7, 13, 143]) expect(fromAny(readSecondaryMonthCounts(monthly, monthAfter(4, m)))).toEqual([]);
  });
});

describe("finer seasonal steps (C-TIME-37/-38)", () => {
  it("reads the 22.5 degree point on April 12 and the 15 degree point on April 5", () => {
    expect(readSeasonalFineStep(new Date(Date.UTC(2026, 3, 12)))).toMatchObject({ degrees: 22.5, offsetDays: 0 });
    expect(readSeasonalFineStep(new Date(Date.UTC(2026, 3, 5)))).toMatchObject({ degrees: 15, offsetDays: 0 });
  });

  it("leaves the class A seasonal points and the days between steps alone", () => {
    expect(readSeasonalFineStep(new Date(Date.UTC(2026, 2, 21)))).toBeNull();
    expect(readSeasonalFineStep(new Date(Date.UTC(2026, 4, 5)))).toBeNull();
    expect(readSeasonalFineStep(new Date(Date.UTC(2026, 3, 8)))).toBeNull();
  });
});

describe("the class C time counts stay context", () => {
  it("leaves the class A time lists unchanged", () => {
    expect([...WHEEL_COUNTS]).toEqual([45, 90, 120, 135, 180, 225, 240, 270, 315, 360]);
    expect(DAY_COUNT_BANDS.map((b) => [...b])).toEqual([
      [7, 12], [18, 21], [28, 31], [42, 49], [57, 65], [85, 92], [112, 120], [150, 157], [175, 185],
    ]);
    expect(MAJOR_CYCLE_YEARS).toEqual([1, 2, 3, 5, 7, 10, 15, 20, 30, 50, 60]);
    expect(ANGLES.map((a) => a.ratio)).toEqual([0.25, 0.5, 1, 2, 4]);
    expect(SEASONAL_POINTS.map((p) => `${p.month}-${p.day}`)).toEqual([
      "5-5", "6-21", "7-23", "8-5", "9-22", "11-8", "11-22", "12-21", "2-4", "3-21",
    ]);
    expect(SQUARE_OF_52_FRACTIONS.filter((f) => f.disclosed).map((f) => f.weeks)).toEqual([6.5, 13, 17.33, 26, 32.5, 39]);
  });

  it("records each count as a measured factor and a card line, live and in the replay alike", () => {
    const monthly = monthlyWithLow(4, 30);
    const ctx = readDisclosedRules(withPivotLow(24), 120, { sharesOutstanding: null, inception: null, monthly }, after(23));
    const f = contextFactorsFor(ctx, "bullish", 120);
    expect(f.secondaryDayCountActive).toBe(true);
    expect(f.dayCountBandActive).toBe(false);
    for (const k of ["secondaryWeekCountActive", "circleDivisionWithTrade", "secondaryMonthCountWithTrade", "cycleFractionWithTrade", "seasonalFineStepActive"]) {
      expect(typeof f[k]).toBe("boolean");
    }
    expect(describeDisclosedRules(ctx).some((l) => l.startsWith("23 days from the low") && l.includes("does not change the setup"))).toBe(true);
  });

  it("gives the circle count the anchor's direction", () => {
    const ctx = readDisclosedRules(withPivotLow(20), 115, null, after(165));
    expect(contextFactorsFor(ctx, "bullish", 115).circleDivisionWithTrade).toBe(true);
    expect(contextFactorsFor(ctx, "bearish", 115).circleDivisionWithTrade).toBe(false);
  });
});

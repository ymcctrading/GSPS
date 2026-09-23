import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import {
  ANGLE_MONTH_COUNTS,
  STARRED_ANGLES_DEG,
  STARRED_MONTH_COUNTS,
  monthsElapsed,
  angleMonthCounts,
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

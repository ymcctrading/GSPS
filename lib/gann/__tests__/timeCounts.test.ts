import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { CYCLE_YEARS_1955, MAJOR_CYCLE_YEARS, MINOR_CYCLE_YEARS_1931, lessonCycleHits } from "../timeCycles";
import { describeDisclosedRules, readDisclosedRules } from "../disclosedRules";
import { contextFactorsFor } from "../contextFactors";

const DAY = 86_400_000;

function bar(t: string, c: number, h = c + 1, l = c - 1): Bar {
  return { t, o: c, h, l, c, v: 1000 };
}

/** Monthly bars from 2010-01: down to a low at `lowAt`, then up, `length` months in all. */
function monthlyWithLow(lowAt: number, length: number): Bar[] {
  return Array.from({ length }, (_, i) => {
    const c = i <= lowAt ? 200 - i * 5 : 200 - lowAt * 5 + (i - lowAt) * 3;
    return bar(new Date(Date.UTC(2010, i, 1)).toISOString(), c);
  });
}
const monthAfter = (lowAt: number, months: number) => new Date(Date.UTC(2010, lowAt + months, 15));

/** One bar per calendar day from 2026-01-01: a clear major low at index 30, then a rise. */
function withPivotLow(daysAfter: number): Bar[] {
  const pre = Array.from({ length: 30 }, (_, i) => 150 - i * 1.5);
  const post = Array.from({ length: daysAfter }, (_, i) => 105 + i * 0.5 + (i % 6 < 3 ? 0 : -1));
  return [...pre, ...post].map((c, i) => bar(new Date(Date.UTC(2026, 0, 1) + i * DAY).toISOString(), c));
}
const LOW_DATE = "2026-01-31";
const after = (days: number) => new Date(Date.parse(`${LOW_DATE}T00:00:00Z`) + days * DAY);

describe("the cycle lists by lesson (M-T3, C-TIME-20, C-TIME-26)", () => {
  it("keeps the 1935 lesson's list word for word", () => {
    expect(MAJOR_CYCLE_YEARS).toEqual([1, 2, 3, 5, 7, 10, 15, 20, 30, 50, 60]);
  });

  it("carries the 1955 lesson's longer list, with 90 the Great Cycle, and the 1931 minor cycles of 3 and 6", () => {
    expect(CYCLE_YEARS_1955).toEqual([1, 2, 3, 5, 7, 9, 10, 12, 14, 15, 18, 20, 21, 22.5, 24, 25, 27, 28, 30, 40, 45, 49, 56, 60, 84, 90]);
    expect(MINOR_CYCLE_YEARS_1931).toEqual([3, 6]);
  });

  it("reads only the cycles the 1935 list lacks, from a major monthly low, to the month", () => {
    const monthly = monthlyWithLow(4, 160);
    const at = (m: number) => lessonCycleHits(monthly, monthAfter(4, m)).map((h) => `${h.years} ${h.lesson} ${h.kind}`);
    expect(at(72)).toEqual(["6 1931 low"]);
    expect(at(108)).toEqual(["9 1955 low"]);
    expect(at(144)).toEqual(["12 1955 low"]);
    // A 1935 cycle (5 and 10 years) is the year-cycle reading's, not this one's.
    expect(at(60)).toEqual([]);
    expect(at(120)).toEqual([]);
    expect(at(73)).toEqual([]);
  });

  it("is a measured context factor with the anchor's direction, and a card line", () => {
    const monthly = monthlyWithLow(4, 160);
    const ctx = readDisclosedRules(withPivotLow(20), 120, { sharesOutstanding: null, inception: null, monthly }, monthAfter(4, 72));
    expect(ctx.timeCounts?.lessonCycles?.map((h) => h.years)).toEqual([6]);
    expect(contextFactorsFor(ctx, "bullish", 120).lessonCycleWithTrade).toBe(true);
    expect(contextFactorsFor(ctx, "bearish", 120).lessonCycleWithTrade).toBe(false);
    expect(describeDisclosedRules(ctx).some((l) => l.startsWith("6 years from the") && l.includes("does not change the setup"))).toBe(true);
    // Without monthly bars the reading is absent, not false.
    expect(contextFactorsFor(readDisclosedRules(withPivotLow(20), 120, null, after(19)), "bullish", 120).lessonCycleWithTrade).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { CYCLE_YEARS_1955, MAJOR_CYCLE_YEARS, MINOR_CYCLE_YEARS_1931, WHEEL_COUNTS, lessonCycleHits, timeCycles } from "../timeCycles";
import { CIRCLE_FINE_DIVISIONS, readCircleDivisions } from "../secondaryTime";
import {
  COMMODITIES_DAY_BANDS,
  RULE_8_MONTHLY_DATES,
  WHEEL_COUNTS_CH5,
  readCommoditiesDayBands,
  readRule8Date,
  readTimeBalanceSpans,
  readWheelCountsCh5,
} from "../timeCounts";
import { DAY_COUNT_BANDS } from "../timeCycles";
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

const fromLow = <T extends { pivotDate: string }>(hs: T[]) => hs.filter((h) => h.pivotDate === LOW_DATE);

describe("the Ch.5 wheel counts (C-TIME-06, Master Course Ch.5 PDF 162)", () => {
  it("carries 30, 60, 150, 210, 300 and 330 days beside the live wheel, which is unchanged", () => {
    expect([...WHEEL_COUNTS_CH5]).toEqual([30, 60, 150, 210, 300, 330]);
    expect([...WHEEL_COUNTS]).toEqual([45, 90, 120, 135, 180, 225, 240, 270, 315, 360]);
    // 150 days left the class C finer divisions for the class A list.
    expect(CIRCLE_FINE_DIVISIONS).not.toContain(150);
    expect(fromLow(readCircleDivisions(withPivotLow(20), after(150)))).toEqual([]);
  });

  it("is active within two days of each count from a major low, with the anchor's direction", () => {
    for (const d of [30, 60, 150, 210, 300, 330]) {
      expect(fromLow(readWheelCountsCh5(withPivotLow(20), after(d))).map((h) => h.label)).toEqual([`${d} days`]);
    }
    expect(fromLow(readWheelCountsCh5(withPivotLow(20), after(212)))).toHaveLength(1);
    expect(fromLow(readWheelCountsCh5(withPivotLow(20), after(213)))).toEqual([]);
    expect(fromLow(readWheelCountsCh5(withPivotLow(20), after(250)))).toEqual([]);
    const ctx = readDisclosedRules(withPivotLow(20), 115, null, after(210));
    expect(contextFactorsFor(ctx, "bullish", 115).wheelCountCh5WithTrade).toBe(true);
    expect(contextFactorsFor(ctx, "bearish", 115).wheelCountCh5WithTrade).toBe(false);
    expect(describeDisclosedRules(ctx).some((l) => l.startsWith("210 days from the low of 2026-01-31"))).toBe(true);
  });

  it("never opens the live turn window", () => {
    expect(timeCycles(withPivotLow(20), after(210)).bullishActive).toBe(false);
  });
});

describe("time balance from top to top and bottom to bottom is class A (M-T11, Commodities p.311)", () => {
  // Tops at days 30 and 80 (50 days apart); the last bottom at day 100.
  const swing = (n: number) => {
    const closes: number[] = [100];
    let c = 100;
    for (const [k, step] of [[30, 1], [20, -1], [30, 1], [20, -1], [n, 1]] as const) for (let i = 0; i < k; i++) closes.push((c += step));
    return closes.map((x, i) => ({ t: new Date(Date.UTC(2026, 0, 1) + i * DAY).toISOString(), o: x, h: x + 0.5, l: x - 0.5, c: x, v: 1000 }));
  };

  it("is read with the class A counts, and keeps its factors", () => {
    const b = swing(30);
    const ctx = readDisclosedRules(b, b[b.length - 1].c, null, new Date(b[b.length - 1].t));
    expect(ctx.timeCounts?.timeBalanceSpans.map((x) => x.kind)).toEqual(["top"]);
    expect(readTimeBalanceSpans(b).map((x) => x.kind)).toEqual(["top"]);
    expect(contextFactorsFor(ctx, "bullish", 150).timeBalanceTurnAgainstTrade).toBe(true);
    expect(describeDisclosedRules(ctx).some((l) => l.includes("time balances, so a top may be due"))).toBe(true);
  });
});

describe("the Commodities p.57 day bands (M-T7)", () => {
  it("is its own cited list beside the Rule 8 bands, which are unchanged", () => {
    expect(COMMODITIES_DAY_BANDS.map((b) => [...b])).toEqual([[42, 45], [49, 52], [90, 98], [120, 135]]);
    expect(DAY_COUNT_BANDS.map((b) => [...b])).toEqual([
      [7, 12], [18, 21], [28, 31], [42, 49], [57, 65], [85, 92], [112, 120], [150, 157], [175, 185],
    ]);
  });

  it("is open on every day inside a band from a major low, and closed outside", () => {
    const at = (d: number) => fromLow(readCommoditiesDayBands(withPivotLow(d + 1))).map((b) => b.band.join("-"));
    expect(at(50)).toEqual(["49-52"]);
    expect(at(95)).toEqual(["90-98"]);
    expect(at(120)).toEqual(["120-135"]);
    expect(at(135)).toEqual(["120-135"]);
    expect(at(46)).toEqual([]);
    expect(at(136)).toEqual([]);
  });

  it("is a measured factor with no direction, and a card line", () => {
    const ctx = readDisclosedRules(withPivotLow(96), 140, null, after(95));
    expect(contextFactorsFor(ctx, "bullish", 140).commoditiesDayBandActive).toBe(true);
    expect(contextFactorsFor(ctx, "bearish", 140).commoditiesDayBandActive).toBe(true);
    expect(describeDisclosedRules(ctx).some((l) => l.startsWith("95 days from the low of 2026-01-31: inside the 90-98 day band"))).toBe(true);
  });
});

describe("the 45 Years Rule 8 calendar dates (M-T5)", () => {
  it("carries only the dates the reading notes give", () => {
    expect(RULE_8_MONTHLY_DATES.map((w) => `${w.month}/${w.startDay}-${w.endDay}${w.mostImportant ? "*" : ""}`)).toEqual([
      "1/7-10", "1/19-24", "9/3-10*", "9/21-28*", "12/3-10", "12/15-24",
    ]);
  });

  it("is open on the days of a window, and closed outside it", () => {
    expect(readRule8Date(new Date(Date.UTC(2026, 0, 7)))).toMatchObject({ month: 1, startDay: 7, endDay: 10 });
    expect(readRule8Date(new Date(Date.UTC(2026, 8, 25)))).toMatchObject({ month: 9, startDay: 21, mostImportant: true });
    expect(readRule8Date(new Date(Date.UTC(2026, 0, 11)))).toBeNull();
    expect(readRule8Date(new Date(Date.UTC(2026, 8, 15)))).toBeNull();
    // A month the notes do not give is not read.
    expect(readRule8Date(new Date(Date.UTC(2026, 3, 8)))).toBeNull();
  });

  it("is a measured factor, and a card line", () => {
    const ctx = readDisclosedRules(withPivotLow(20), 115, null, new Date(Date.UTC(2026, 8, 5)));
    const f = contextFactorsFor(ctx, "bullish", 115);
    expect(f.rule8DateActive).toBe(true);
    expect(f.rule8DateMostImportant).toBe(true);
    expect(describeDisclosedRules(ctx).some((l) => l.startsWith("September 3-10: one of the month's turn dates"))).toBe(true);
    expect(contextFactorsFor(readDisclosedRules(withPivotLow(20), 115, null, new Date(Date.UTC(2026, 3, 8))), "bullish", 115).rule8DateActive).toBe(false);
  });
});

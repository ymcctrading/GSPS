import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import {
  FAN_TIME_RATIOS,
  cycleFractions,
  describeSecondaryTime,
  readSecondaryTime,
  readFanTimeRatios,
  readRetracementTimingHits,
  readTimeBalanceSpans,
  falseBreakAt,
  shortCounterMovePhase,
  readCircleDivisions,
  readCycleFractions,
  readSeasonalFineStep,
  SEASONAL_FRAME,
  SEASONAL_FINE_DEGREES,
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
import { DEFAULT_SATURATION_BOUNDS } from "@/lib/validation/health";

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

  it("on weekday bars, flags each count on the first session on or after it, once", () => {
    // Weekdays from Monday 2026-01-05; the low on Thursday 2026-02-12 (index 28).
    const dates: string[] = [];
    for (let d = Date.UTC(2026, 0, 5); dates.length < 90; d += DAY) {
      const wd = new Date(d).getUTCDay();
      if (wd !== 0 && wd !== 6) dates.push(new Date(d).toISOString());
    }
    const closes = [...Array.from({ length: 29 }, (_, i) => 150 - i * 1.5), ...Array.from({ length: 61 }, (_, i) => 110 + i * 0.5 + (i % 6 < 3 ? 0 : -1))];
    const bars = closes.map((c, i) => bar(dates[i], c));
    const low = "2026-02-12";
    expect(new Date(`${low}T00:00:00Z`).getUTCDay()).toBe(4);
    const age = (i: number) => (Date.parse(dates[i]) - Date.parse(`${low}T00:00:00Z`)) / DAY;
    const counted = (n: number) => readSecondaryDayCounts(bars.slice(0, n + 1)).filter((h) => h.pivotDate === low).map((h) => h.label);
    for (const [target, label] of [[23, "23 days"], [45, "45-46 days"], [49, "49 days"]] as const) {
      const first = dates.findIndex((_, i) => age(i) >= target);
      expect(counted(first)).toEqual([label]);
      expect(counted(first + 1)).toEqual([]);
      expect(counted(first - 1)).toEqual([]);
    }
    // Day 23 falls on a Saturday: it is read on the Monday.
    expect(age(dates.findIndex((_, i) => age(i) >= 23))).toBe(25);
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
  it("is active 112, 157, 165, 202, 247, 292 and 337 days after a major low", () => {
    for (const d of [112, 157, 165, 202, 247, 292, 337]) {
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

  it("rounds a fraction that is not a whole month to the nearest month", () => {
    // 1/8 of 5 years is 7.5 months, read in month 8; 1/8 of 7 years, 10.5, in month 11.
    const monthly = monthlyWithLow(10, 60);
    expect(fromAny(readCycleFractions(monthly, monthAfter(10, 8)))).toContain("1/8 of the 5-year cycle");
    expect(fromAny(readCycleFractions(monthly, monthAfter(10, 7)))).not.toContain("1/8 of the 5-year cycle");
    expect(fromAny(readCycleFractions(monthly, monthAfter(10, 11)))).toContain("1/8 of the 7-year cycle");
    expect(fromAny(readCycleFractions(monthly, monthAfter(10, 10)))).not.toContain("1/8 of the 7-year cycle");
  });

  it("takes the month counts' and fractions' direction from the anchor: a low argues up", () => {
    const ctx = readDisclosedRules(withPivotLow(20), 120, null, after(19));
    const low = { pivotDate: LOW_DATE, pivotKind: "low" as const, count: 6, label: "6 months" };
    const high = { ...low, pivotKind: "high" as const };
    for (const key of ["monthCounts", "cycleFractions"] as const) {
      const factor = key === "monthCounts" ? "secondaryMonthCountWithTrade" : "cycleFractionWithTrade";
      for (const [hits, bullish, bearish] of [[[low], true, false], [[high], false, true]] as const) {
        const c = { ...ctx, secondaryTime: { ...ctx.secondaryTime!, [key]: hits } };
        expect(contextFactorsFor(c, "bullish", 120)[factor]).toBe(bullish);
        expect(contextFactorsFor(c, "bearish", 120)[factor]).toBe(bearish);
      }
    }
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
  it("reads the 15 degree point on April 4, and leaves April 12 to the class A sixteenths", () => {
    expect(readSeasonalFineStep(new Date(Date.UTC(2026, 3, 4)))).toMatchObject({ degrees: 15, offsetDays: 0 });
    // 22.5 degrees is the 1/16 point, now a class A seasonal point.
    expect(readSeasonalFineStep(new Date(Date.UTC(2026, 3, 12)))).toBeNull();
    expect(SEASONAL_FINE_DEGREES.some((d) => d % 22.5 === 0)).toBe(false);
  });

  it("is open a day either side of a step and closed at two", () => {
    expect(readSeasonalFineStep(new Date(Date.UTC(2026, 3, 5)))).toMatchObject({ degrees: 15, offsetDays: 1 });
    expect(readSeasonalFineStep(new Date(Date.UTC(2026, 3, 2)))).toBeNull();
    expect(readSeasonalFineStep(new Date(Date.UTC(2026, 3, 6)))).toBeNull();
  });

  it("places each step between the class A points around it, so it stays on the sources' dates through the year", () => {
    // The frame is the class A points' own dates.
    expect(SEASONAL_FRAME.slice(1, -1).map((p) => `${p.month}-${p.day}`).sort()).toEqual(
      SEASONAL_POINTS.filter((p) => p.label !== "the full year").map((p) => `${p.month}-${p.day}`).sort(),
    );
    // 195° is two thirds of the way from Sep 22 (180°) to Oct 15 (202.5°).
    expect(readSeasonalFineStep(new Date(Date.UTC(2026, 9, 7)))).toMatchObject({ degrees: 195, offsetDays: 0 });
    // 330° is two thirds of the way from Feb 4 (315°) to Feb 28 (337.5°), in the next calendar year.
    expect(readSeasonalFineStep(new Date(Date.UTC(2027, 1, 20)))).toMatchObject({ degrees: 330, offsetDays: 0 });
    // Across the new year: 285° two thirds of the way from Dec 21 (270°) to Jan 13 (292.5°).
    expect(readSeasonalFineStep(new Date(Date.UTC(2027, 0, 5)))).toMatchObject({ degrees: 285, offsetDays: 0 });
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
    expect(ANGLES.map((a) => a.ratio)).toEqual([16, 8, 4, 3, 2, 1, 1 / 2, 1 / 3, 1 / 4, 1 / 8, 1 / 16]);
    expect(SEASONAL_POINTS.map((p) => `${p.month}-${p.day}`)).toEqual([
      "5-5", "6-21", "7-23", "8-5", "9-22", "11-8", "11-22", "12-21", "2-4", "3-21",
      "4-12", "5-27", "7-14", "8-31", "10-15", "11-30", "1-13", "2-28",
    ]);
    expect(SQUARE_OF_52_FRACTIONS.filter((f) => f.disclosed).map((f) => f.weeks)).toEqual([3.25, 6.5, 13, 17.33, 19.5, 26, 32.5, 34.67, 39, 45.5]);
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

/** Daily bars from 2026-01-01 built from (days, step) legs. */
function legs(spec: [number, number][], start = 100): Bar[] {
  const closes: number[] = [start];
  let c = start;
  for (const [n, step] of spec) for (let i = 0; i < n; i++) closes.push((c += step));
  return closes.map((x, i) => ({ t: new Date(Date.UTC(2026, 0, 1) + i * DAY).toISOString(), o: x, h: x + 0.5, l: x - 0.5, c: x, v: 1000 }));
}

describe("short counter-moves (C-TIME-25, W003 p.22)", () => {
  it("reads a 5-day counter-move as past its 4th day and a 7-10-day one as the next counter-move's length", () => {
    expect([1, 3, 4].map(shortCounterMovePhase)).toEqual(["normal", "normal", "normal"]);
    expect([5, 6].map(shortCounterMovePhase)).toEqual(["pastFourthDay", "pastFourthDay"]);
    expect([7, 10].map(shortCounterMovePhase)).toEqual(["sevenToTen", "sevenToTen"]);
    expect(shortCounterMovePhase(11)).toBe("longer");
  });

  it("counts the open counter-move in trading days, on the live scan and the replay's shared reader", () => {
    const ctx = readDisclosedRules(legs([[40, 1], [5, -1]]), 135, null, new Date(Date.UTC(2026, 1, 15)));
    expect(ctx.secondaryTime?.shortCounterMove).toEqual({ trend: "bullish", tradingDays: 5, phase: "pastFourthDay" });
    expect(contextFactorsFor(ctx, "bullish", 135)).toMatchObject({ counterMovePastFourthDay: true, counterMoveSevenToTen: false });
    // A short's trend is not the one this counter-move runs against.
    expect(contextFactorsFor(ctx, "bearish", 135).counterMovePastFourthDay).toBeUndefined();
    expect(describeDisclosedRules(ctx).some((l) => l.includes("5 trading days, past its 4th day"))).toBe(true);
    expect(readDisclosedRules(legs([[40, 1], [3, -1]]), 137).secondaryTime?.shortCounterMove?.phase).toBe("normal");
  });
});

describe("time balance from top to top and bottom to bottom (C-TIME-42, W032)", () => {
  // Tops at days 30 and 80 (50 days, about 7.1 weeks apart); the last bottom at day 100.
  const swing = (n: number) => legs([[30, 1], [20, -1], [30, 1], [20, -1], [n, 1]]);

  it("points to a top when the open span since the last top balances the last top-to-top span within a week", () => {
    for (const n of [23, 30, 37]) expect(readTimeBalanceSpans(swing(n)).map((b) => b.kind)).toEqual(["top"]);
    for (const n of [15, 40]) expect(readTimeBalanceSpans(swing(n))).toEqual([]);
  });

  it("measures against the last top-to-top span, not an earlier one", () => {
    // Tops at days 30, 70 and 110: each span is 40 days, first to last 80.
    const three = (n: number) => legs([[30, 1], [20, -1], [20, 1], [10, -1], [30, 1], [20, -1], [n, 1]]);
    expect(readTimeBalanceSpans(three(20)).map((b) => b.kind)).toEqual(["top"]);
    expect(readTimeBalanceSpans(three(60))).toEqual([]);
  });

  it("confirms a due turn with a false break: past the prior top intraday, closed back under it (C-STOP-03, W032)", () => {
    // Tops near 140 at day 80; the rise since runs to about 137, 50 days on.
    const base = legs([[30, 1], [20, -1], [30, 1], [20, -1], [29, 0.6]]);
    const last = base[base.length - 1];
    const next = (h: number, c: number): Bar[] => [...base, { ...last, t: new Date(Date.parse(last.t) + DAY).toISOString(), o: c, h, l: c - 0.5, c }];
    const priorTop = 140.5;
    const poked = next(priorTop + 1, priorTop - 1);
    expect(readTimeBalanceSpans(poked)[0]).toMatchObject({ kind: "top", falseBreak: true });
    // Past the swing's running high but short of the prior top: not a false break.
    expect(readTimeBalanceSpans(next(139, 137.5))[0]).toMatchObject({ kind: "top", falseBreak: false });
    // Closed past the prior top: a break, not a false one.
    expect(readTimeBalanceSpans(next(priorTop + 1, priorTop + 0.5))[0]?.falseBreak).not.toBe(true);
    // The mirror, on its own: under the prior bottom and closed back over it.
    const down: Bar[] = [100, 98, 96, 94, 95].map((c, i) => ({ t: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(), o: c, h: c + 0.5, l: c - 0.5, c, v: 1 }));
    expect(falseBreakAt([...down, { ...down[4], t: "2026-01-06T00:00:00.000Z", l: 92, c: 94 }], 93.5, "bottom")).toBe(true);
    expect(falseBreakAt([...down, { ...down[4], t: "2026-01-06T00:00:00.000Z", l: 92, c: 93 }], 93.5, "bottom")).toBe(false);
    // The factor: a due top confirmed by a false break is with a short, not a long.
    const ctx = readDisclosedRules(poked, priorTop - 1);
    expect(contextFactorsFor(ctx, "bearish", priorTop - 1).timeBalanceFalseBreakWithTrade).toBe(true);
    expect(contextFactorsFor(ctx, "bullish", priorTop - 1).timeBalanceFalseBreakWithTrade).toBe(false);
  });

  it("does not look for a bottom while the swing runs up from one", () => {
    // Day 100 + 50 would balance bottom to bottom, but the last turn is a bottom.
    expect(readTimeBalanceSpans(swing(50)).some((b) => b.kind === "bottom")).toBe(false);
  });

  it("counts a top due against a long and not against a short", () => {
    const b = swing(30);
    const ctx = readDisclosedRules(b, b[b.length - 1].c, null, new Date(b[b.length - 1].t));
    expect(contextFactorsFor(ctx, "bullish", 150).timeBalanceTurnAgainstTrade).toBe(true);
    expect(contextFactorsFor(ctx, "bearish", 150).timeBalanceTurnAgainstTrade).toBe(false);
  });
});

describe("the fan as a time calculator (C-TIME-40, W033 pp.1-3)", () => {
  // The fans' low anchor is day 50, after a 20-day fall from the day-30 high.
  const b = legs([[30, 1], [20, -1], [10, 1]]);
  const lowMs = Date.UTC(2026, 0, 1) + 50 * DAY;

  it("projects every ratio from 1x8 to 8x1 of the anchor swing's duration", () => {
    expect(FAN_TIME_RATIOS.map((r) => r.ratio)).toEqual([1 / 8, 1 / 4, 1 / 3, 1 / 2, 1, 2, 3, 4, 8]);
    const due = (days: number) => readFanTimeRatios(b, new Date(lowMs + days * DAY)).map((h) => h.label);
    expect(due(2.5)).toContain("1x8");
    expect(due(20 / 3)).toContain("1x3");
    expect(due(60)).toEqual(["3x1"]);
    expect(due(160)).toEqual(["8x1"]);
    expect(due(100)).toEqual([]);
    // Open two days either side, closed at three.
    expect(due(62)).toEqual(["3x1"]);
    expect(due(63)).toEqual([]);
    const lines = describeSecondaryTime(readSecondaryTime(b, null, new Date(lowMs + 60 * DAY)));
    expect(lines.some((l) => l.startsWith("The 3x1 time ratio from the last low comes due"))).toBe(true);
  });

  it("leaves the scored fan angles' own list alone", () => {
    // Gann's full set since Q27 (2026-10-16), not extended by the time ratios.
    expect(ANGLES.map((a) => a.label)).toEqual(["16x1", "8x1", "4x1", "3x1", "2x1", "1x1", "1x2", "1x3", "1x4", "1x8", "1x16"]);
  });
});

describe("a retracement reached at its angle's time (C-TIME-39, W031) and half the range at half the time (C-TIME-23, W003)", () => {
  // A high at day 10, a 20-day fall to a low at day 30 (range 21), then a rise of `step` a day for `n` days.
  const swing = (step: number, n: number) => legs([[10, 1], [20, -1], [n, step]]);

  it("flags the 50% level reached on the date the 1x1 gives", () => {
    const hits = readRetracementTimingHits(swing(1, 10));
    expect(hits.map((h) => `${h.label} ${h.angle} ${h.date}`)).toEqual(["1/2 1x1 2026-02-10"]);
  });

  it("does not flag the 50% level reached on another date, and times each fraction by its angle's time", () => {
    // At half the speed, 50% comes at day 21 of the rise, outside the 1x1's window.
    expect(readRetracementTimingHits(swing(0.5, 25)).some((h) => h.label === "1/2")).toBe(false);
    // The 1x2 takes half the square's time (W033), so 3/8 is due at 3/8 x 1/2 x 20 =
    // 3.75 days: a rise of 1.8 a day reaches it on day 4 (and 1/8 on the 1x8's day 1).
    expect(readRetracementTimingHits(swing(1.8, 25)).map((h) => `${h.label} ${h.angle} ${h.date}`)).toEqual([
      "1/8 1x8 2026-02-01",
      "3/8 1x2 2026-02-04",
    ]);
    expect(readRetracementTimingHits(swing(1, 25)).some((h) => h.label === "3/8")).toBe(false);
    // The 3x1 takes three times it, so 2/3 is due at day 40, not day 4.4.
    expect(readRetracementTimingHits(swing(0.35, 45)).map((h) => `${h.label} ${h.angle}`)).toEqual(["2/3 3x1"]);
  });

  it("allows a sixteenth of the swing's time either side, not more", () => {
    // Two slow days first: 50% is reached two days after the 1x1's date, outside ±1.25 days.
    const late = legs([[10, 1], [20, -1], [2, 0.1], [15, 1]]);
    expect(readRetracementTimingHits(late).some((h) => h.label === "1/2")).toBe(false);
  });

  it("is current only while the angle's window is open, while the half-and-half meeting is kept for 90 days", () => {
    const now = readSecondaryTime(swing(1, 10), null, new Date(Date.UTC(2026, 1, 10)));
    expect(now.retracementTiming?.map((h) => h.label)).toEqual(["1/2"]);
    expect(now.halfPriceHalfTime?.date).toBe("2026-02-10");
    const later = readSecondaryTime(swing(1, 30), null, new Date(Date.UTC(2026, 2, 2)));
    expect(later.retracementTiming).toEqual([]);
    expect(later.halfPriceHalfTime?.date).toBe("2026-02-10");
    const b = legs([[10, 1], [20, -1], [10, 1], [100, 0.01]]);
    expect(readSecondaryTime(b, null, new Date(b[b.length - 1].t)).halfPriceHalfTime).toBeNull();
    const eighty = legs([[10, 1], [20, -1], [10, 1], [80, 0.01]]);
    expect(readSecondaryTime(eighty, null, new Date(eighty[eighty.length - 1].t)).halfPriceHalfTime?.date).toBe("2026-02-10");
    // A small dip after the meeting makes newer swings; the meeting is still kept.
    const dip = legs([[10, 1], [20, -1], [10, 1], [5, 1], [3, -1], [10, 0.3]]);
    expect(readRetracementTimingHits(dip).some((h) => h.date === "2026-02-10")).toBe(false);
    expect(readSecondaryTime(dip, null, new Date(dip[dip.length - 1].t)).halfPriceHalfTime?.date).toBe("2026-02-10");
  });

  it("keeps the half-and-half meeting rare enough to mean something on a random walk (item 7e review M2)", () => {
    // Seeded random walks on weekday bars. Counting every small swing as "the
    // range" put the meeting on 98% of sessions; the range is a major swing.
    let seed = 1;
    const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
    let hit = 0;
    let n = 0;
    for (let k = 0; k < 20; k++) {
      const b: Bar[] = [];
      let c = 100;
      for (let d = Date.UTC(2024, 0, 1); b.length < 260; d += DAY) {
        const wd = new Date(d).getUTCDay();
        if (wd === 0 || wd === 6) continue;
        const o = c;
        c = c * (1 + (rand() - 0.5) * 0.04);
        b.push({ t: new Date(d).toISOString(), o, h: Math.max(o, c) * (1 + rand() * 0.01), l: Math.min(o, c) * (1 - rand() * 0.01), c, v: 1e6 });
      }
      for (let i = 120; i < b.length; i += 3) {
        const s = b.slice(0, i + 1);
        n++;
        if (readSecondaryTime(s, null, new Date(s[s.length - 1].t)).halfPriceHalfTime) hit++;
      }
    }
    expect(hit / n).toBeLessThan(DEFAULT_SATURATION_BOUNDS.maxPassRate);
    // Measured at about 0.8 (item 8 review L3); a regression toward the bound fails here first.
    expect(hit / n).toBeLessThan(0.85);
  });

  it("counts a turn due against the trade and records it on the card", () => {
    const b = swing(1, 10);
    const ctx = readDisclosedRules(b, 100, null, new Date(b[b.length - 1].t));
    expect(contextFactorsFor(ctx, "bullish", 100)).toMatchObject({ retracementTurnAgainstTrade: true, halfPriceHalfTimeRecent: true });
    expect(contextFactorsFor(ctx, "bearish", 100).retracementTurnAgainstTrade).toBe(false);
    const lines = describeDisclosedRules(ctx);
    expect(lines.some((l) => l.startsWith("The 1/2 retracement (100.00) was reached 2026-02-10, at the time the 1x1 angle"))).toBe(true);
    expect(lines.some((l) => l.startsWith("Half the range was retraced at half the time on 2026-02-10"))).toBe(true);
  });
});

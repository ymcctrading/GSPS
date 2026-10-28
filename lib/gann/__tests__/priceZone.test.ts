import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { annualRange, integerSquareLevels, monthlyAngle, priceZone, readFirstFallFromHigh } from "@/lib/gann/priceZone";
import { computeAngleSlopes } from "@/lib/gann/normalizedSlope";

const DAY = 86_400_000;
const daily = (closes: number[], start = "2026-01-05"): Bar[] =>
  closes.map((c, i) => ({ t: new Date(Date.parse(`${start}T05:00:00Z`) + i * DAY).toISOString(), o: c, h: c + 0.5, l: c - 0.5, c, v: 1e6 }));

describe("A-PRICE-01: the price zones where moves speed up", () => {
  it("names the zone in the literal dollars of the rule", () => {
    expect(priceZone(45)).toBe("under 50");
    expect(priceZone(75)).toBe("50 to 100");
    expect(priceZone(120)).toBe("100 to 150");
    expect(priceZone(160)).toBe("150 to 200");
    expect(priceZone(250)).toBe("over 200");
    // Each edge belongs to the zone above it.
    expect([50, 100, 150, 200].map(priceZone)).toEqual(["50 to 100", "100 to 150", "150 to 200", "over 200"]);
  });

  it("reads the first 100 points down from the high, the fastest part of a fall", () => {
    const up = Array.from({ length: 100 }, (_, i) => 200 + i);
    const fall = Array.from({ length: 30 }, (_, i) => 299 - 2 * (i + 1)); // to 239: 60 points under the top
    const r = readFirstFallFromHigh(daily([...up, ...fall]), new Date("2026-06-30T15:00:00Z"))!;
    expect(r.high).toBeCloseTo(299.5, 6);
    expect(r.pointsDown).toBeCloseTo(299.5 - 239, 6);
    expect(r.inFirstFall).toBe(true);
    const deep = Array.from({ length: 70 }, (_, i) => 299 - 2 * (i + 1)); // to 159: 140 points under
    expect(readFirstFallFromHigh(daily([...up, ...deep]), new Date("2026-07-30T15:00:00Z"))!.inFirstFall).toBe(false);
  });

  it("reads the high from the 52 weeks of completed sessions only", () => {
    const up = Array.from({ length: 100 }, (_, i) => 200 + i);
    const fall = Array.from({ length: 30 }, (_, i) => 299 - 2 * (i + 1));
    const old: Bar = { t: "2024-06-03T14:00:00.000Z", o: 900, h: 1000, l: 900, c: 950, v: 1e6 };
    const bars = [old, ...daily([...up, ...fall])];
    const asOf = new Date(Date.parse(bars[bars.length - 1].t) + DAY + 3_600_000 * 10);
    const forming: Bar = { t: asOf.toISOString(), o: 239, h: 400, l: 239, c: 239, v: 1e6 };
    const r = readFirstFallFromHigh([...bars, forming], asOf)!;
    expect(r.high).toBeCloseTo(299.5, 6);
    expect(r.inFirstFall).toBe(true);
  });

  it("reads the same 52 weeks as the entry chart", async () => {
    const { ENTRY_CHART_DAYS } = await import("@/lib/scan/entrySelection");
    const { FIRST_FALL_CHART_DAYS } = await import("@/lib/gann/priceZone");
    expect(FIRST_FALL_CHART_DAYS).toBe(ENTRY_CHART_DAYS);
  });

  it("does not read a fall at the high itself, inside the 3 points", () => {
    const up = Array.from({ length: 100 }, (_, i) => 200 + i);
    expect(readFirstFallFromHigh(daily([...up, 298]), new Date("2026-06-30T15:00:00Z"))!.inFirstFall).toBe(false);
  });
});

describe("A-PRICE-06: the expected annual range from the stock's own years", () => {
  /** Monthly bars: each year ranges `width` points, from 100. */
  const monthly = (widths: number[]): Bar[] =>
    widths.flatMap((w, y) =>
      Array.from({ length: 12 }, (_, m) => {
        const c = 100 + (w * m) / 11;
        return { t: new Date(Date.UTC(2016 + y, m, 1)).toISOString(), o: c, h: c, l: c, c, v: 1e6 };
      }),
    );

  it("is the median calendar-year range of the completed years, in points", () => {
    const r = annualRange(monthly([10, 20, 30, 40, 25]), new Date("2026-10-16T15:00:00Z"))!;
    expect(r.years).toBe(5);
    expect(r.medianPoints).toBe(25);
  });

  it("leaves out the year still running and years older than ten", () => {
    const m = monthly([500, 10, 20, 30, 40, 25, 15, 35, 45, 50, 5, 900]); // 2016 .. 2027
    const r = annualRange(m, new Date("2027-03-01T15:00:00Z"))!;
    // 2017-2026: 10, 20, 30, 40, 25, 15, 35, 45, 50, 5
    expect(r.years).toBe(10);
    expect(r.medianPoints).toBe(27.5);
  });
});

describe("C-LEVELS-01: squares of whole numbers and the points halfway between", () => {
  it("lists 100, 110.5 and 121 around 110, as context only", () => {
    const levels = integerSquareLevels(110);
    expect(levels).toEqual([100, 110.5, 121]);
  });
});

describe("A-PRICE-05: a 45-degree line from a low at a fixed number of points a month", () => {
  it("runs coffee's 1x1 from 435 at 30 points a month to 8715 after 276 months", () => {
    expect(monthlyAngle(435, "2000-01", 30, "2023-01")).toBe(8715);
  });
});

describe("A-PRICE-02: speed is the price moved in a unit of time", () => {
  it("reads a move from 100 to 130 over 30 calendar days as 1 point a day", () => {
    const closes = [...Array.from({ length: 20 }, (_, i) => 120 - i), 100, ...Array.from({ length: 30 }, (_, i) => 101 + i)];
    const bars = daily(closes);
    const low = computeAngleSlopes(bars, 130).find((r) => r.anchorKind === "low")!;
    expect(low.anchorPrice).toBeCloseTo(99.5, 6);
    expect(low.pointsPerDay).toBeCloseTo((130 - 99.5) / 30, 9);
    // Calendar time, not bars: the same move on weekly bars is 210 days.
    const weekly = closes.map((c, i) => ({ ...bars[i], t: new Date(Date.parse(bars[0].t) + i * 7 * DAY).toISOString() }));
    expect(computeAngleSlopes(weekly, 130).find((r) => r.anchorKind === "low")!.pointsPerDay).toBeCloseTo((130 - 99.5) / 210, 9);
  });
});

describe("the price readings reach the card and the factors, and nothing else", () => {
  it("puts zone, first fall, annual range, squares and the monthly line on the card", async () => {
    const { readDisclosedRules, describeDisclosedRules } = await import("@/lib/gann/disclosedRules");
    const { contextFactorsFor } = await import("@/lib/gann/contextFactors");
    const up = Array.from({ length: 100 }, (_, i) => 200 + i);
    const fall = Array.from({ length: 30 }, (_, i) => 299 - 2 * (i + 1));
    const bars = daily([...up, ...fall]);
    // Monthly lows with a campaign bottom at 2025-04 (strength-3 pivot).
    const lows = [...Array.from({ length: 12 }, (_, i) => 280 - 10 * i), 150, 140, 130, 120, 110, 100, 90, 100, 110, 120, 130, 140, 150, 160];
    const monthly: Bar[] = lows.map((l, i) => ({ t: new Date(Date.UTC(2023, 9 + i, 1)).toISOString(), o: l + 5, h: l + 10, l, c: l + 5, v: 1e6 }));
    const asOf = new Date("2026-06-30T15:00:00Z");
    const ctx = readDisclosedRules(bars, 239, { sharesOutstanding: null, inception: null, monthly }, asOf);
    expect(ctx.priceZone).toBe("over 200");
    expect(ctx.firstFall?.inFirstFall).toBe(true);
    expect(ctx.annualRange?.years).toBe(3);
    expect(ctx.integerSquares).toEqual([225, 240.5, 256]);
    // 14 months at 1 point a month, the point scaled to the symbol's price like every other angle.
    const { pointForBars } = await import("@/lib/gann/pointScale");
    const angleAt = 90 + 14 * pointForBars(bars);
    expect(angleAt).not.toBeCloseTo(104, 1);
    expect(ctx.monthlyAngle).toEqual({ from: 90, fromMonth: "2025-04", price: angleAt });
    const lines = describeDisclosedRules(ctx);
    for (const s of ["Price zone over 200", "first 100 points down", "usual yearly range", "225, 240.5 (halfway) and 256", `at 1 point a month stands at ${angleAt.toFixed(2)}`]) {
      expect(lines.some((l) => l.includes(s))).toBe(true);
    }
    expect(contextFactorsFor(ctx, "bullish", 239).firstFallFromHighAgreesWithTrade).toBe(false);
    expect(contextFactorsFor(ctx, "bearish", 239).firstFallFromHighAgreesWithTrade).toBe(true);
    expect(contextFactorsFor(ctx, "bullish", 239).overMonthlyAngleAgreesWithTrade).toBe(true);
    expect(contextFactorsFor(ctx, "bearish", 239).overMonthlyAngleAgreesWithTrade).toBe(false);
  });

  it("keeps the squares and the zones out of scoring, levels and targets", async () => {
    const fs = await import("node:fs");
    for (const f of ["lib/scoring/score.ts", "lib/strat/levels.ts", "lib/scanTicker.ts", "lib/backtest/replay.ts", "lib/gann/targets.ts"]) {
      if (!fs.existsSync(f)) continue;
      const src = fs.readFileSync(f, "utf8");
      expect(src).not.toMatch(/integerSquare|priceZone|monthlyAngle|firstFall|annualRange/);
    }
  });
});

import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import {
  MIN_CAMPAIGN_MONTHS,
  latestCampaign,
  majorRangeDivisions,
  rangeDivisionMatch,
} from "@/lib/gann/rangeDivisions";
import { nearestLevelMatchByRole } from "@/lib/scoring/proximity";
import { srMatchForSide } from "@/lib/scoring/score";

const bar = (i: number, h: number, l: number): Bar => {
  const d = new Date(Date.UTC(2010, i, 1)).toISOString().slice(0, 10);
  return { t: `${d}T05:00:00.000Z`, o: l, h, l, c: h, v: 1 };
};

describe("divisions of the major ranges (Master Course Ch. 9, PDF 263-264)", () => {
  it("divides the extreme range and the highest price by 8 and by 3, the extreme range first and 50% first", () => {
    const levels = majorRangeDivisions([bar(0, 30, 20), bar(1, 100, 60)], []);
    expect(levels).toHaveLength(18);
    expect(levels[0]).toMatchObject({ basis: "extremeRange", importance: 1, price: 60 });
    const highestHalf = levels.find((l) => l.basis === "highestPrice" && l.importance === 1);
    expect(highestHalf?.price).toBe(50);
    const r = (x: number) => Number(x.toFixed(4));
    expect(levels.filter((l) => l.basis === "extremeRange").map((l) => r(l.price)).sort((a, b) => a - b)).toEqual(
      [30, 40, 20 + 80 / 3, 50, 60, 70, 20 + 160 / 3, 80, 90].map(r).sort((a, b) => a - b),
    );
  });

  it("reads the 1946 top at 50% of the 1929-1932 range, as 45 Years in Wall Street Ch. IV does", () => {
    // 386.10 (1929) to 40.56 (1932): half-way 213.33; the 1946 top was 213.36.
    const levels = majorRangeDivisions([bar(0, 386.1, 300), bar(30, 60, 40.56)], []);
    const m = rangeDivisionMatch(levels, 210, "resistance");
    expect(m).toMatchObject({ basis: "extremeRange", importance: 1, role: "resistance" });
    expect(m!.price).toBeCloseTo(213.33, 2);
  });

  it("reads the 1938 low at half the highest price, as Master Course Ch. 9 does", () => {
    // 195½ (1937): half 97¾; the March 31, 1938 low was 97½.
    const levels = majorRangeDivisions([bar(0, 195.5, 150), bar(12, 120, 41)], []);
    const m = rangeDivisionMatch(levels, 98, "support");
    expect(m).toMatchObject({ basis: "highestPrice", importance: 1, price: 97.75 });
  });

  it("is support below price and resistance above it, never the other role", () => {
    const levels = majorRangeDivisions([bar(0, 100, 20)], []);
    // 60 (the extreme range's half) is above 59: resistance only.
    expect(rangeDivisionMatch(levels, 59.5, "resistance")?.price).toBe(60);
    expect(rangeDivisionMatch(levels, 59.5, "support")?.price).not.toBe(60);
  });

  it("matches only inside the 3-point allowance at the level", () => {
    const levels = majorRangeDivisions([bar(0, 400, 380)], []).filter((l) => l.basis === "extremeRange");
    // Divisions of a 20-point range at about $390: the nearest is under a
    // point away, inside the allowance; nothing of this range is 30 points off.
    expect(rangeDivisionMatch(levels, 391, "support")).not.toBeNull();
    expect(rangeDivisionMatch(levels, 430, "support")).toBeNull();
  });
});

describe("the latest campaign of a year or more", () => {
  // A low of 10 in month 3, a rise to 50 in month 3 + months, then a decline.
  function campaign(months: number): Bar[] {
    const bars: Bar[] = [];
    for (let i = 0; i < 3; i++) bars.push(bar(i, 20 - i, 14 - i));
    bars.push(bar(3, 13, 10));
    for (let i = 1; i <= months; i++) {
      const p = 10 + (40 * i) / months;
      bars.push(bar(3 + i, p, p - 2));
    }
    for (let i = 1; i <= 6; i++) bars.push(bar(3 + months + i, 50 - 3 * i, 46 - 3 * i));
    return bars;
  }

  it("divides a move between two monthly swing extremes a year or more apart", () => {
    expect(latestCampaign(campaign(MIN_CAMPAIGN_MONTHS + 6))).toEqual({ low: 10, high: 50 });
    const levels = majorRangeDivisions(campaign(MIN_CAMPAIGN_MONTHS + 6), campaign(MIN_CAMPAIGN_MONTHS + 6));
    expect(levels.find((l) => l.basis === "campaign" && l.importance === 1)?.price).toBe(30);
  });

  it("does not count a swing shorter than a year", () => {
    expect(latestCampaign(campaign(MIN_CAMPAIGN_MONTHS - 4))).toBeNull();
  });
});

describe("the S/R check asks for the wanted role (score.ts historicalSR)", () => {
  const levels = [
    { price: 100.5, timeframe: "1Day" as const },
    { price: 98, timeframe: "1Week" as const },
  ];

  it("finds the support in the band though the nearest level is overhead", () => {
    const byRole = nearestLevelMatchByRole(100, levels, 3);
    expect(byRole.support?.price).toBe(98);
    expect(byRole.resistance?.price).toBe(100.5);
    expect(srMatchForSide(byRole, "bullish")?.price).toBe(98);
    expect(srMatchForSide(byRole, "bearish")?.price).toBe(100.5);
  });

  it("falls back to the other role so the note can say it is on the wrong side", () => {
    const byRole = nearestLevelMatchByRole(100, [levels[0]], 3);
    expect(byRole.support).toBeNull();
    expect(srMatchForSide(byRole, "bullish")?.price).toBe(100.5);
  });
});

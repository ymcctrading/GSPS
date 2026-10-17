import { describe, expect, it } from "vitest";
import { calendarDayOneByOne, nearestGannAngle, normalizedSlope, readCalendarDayAngles } from "../normalizedSlope";

describe("normalizedSlope", () => {
  it("computes (price_t - anchor_price) / (atr_at_anchor * bars_since_anchor)", () => {
    // Price rose 10 over 5 bars, ATR at anchor was 2 -> 10 / (2 * 5) = 1 (a 1x1 slope).
    expect(normalizedSlope(110, 100, 2, 5)).toBe(1);
  });

  it("is negative for a decline off the anchor", () => {
    expect(normalizedSlope(90, 100, 2, 5)).toBe(-1);
  });

  it("returns null rather than dividing by zero when ATR or bars-since-anchor is non-positive", () => {
    expect(normalizedSlope(110, 100, 0, 5)).toBeNull();
    expect(normalizedSlope(110, 100, 2, 0)).toBeNull();
    expect(normalizedSlope(110, 100, -1, 5)).toBeNull();
  });

  it("returns null for non-finite price inputs", () => {
    expect(normalizedSlope(NaN, 100, 2, 5)).toBeNull();
    expect(normalizedSlope(110, Infinity, 2, 5)).toBeNull();
  });
});

describe("nearestGannAngle", () => {
  it("picks the closest fixed ratio and reports direction", () => {
    expect(nearestGannAngle(1)).toEqual({ label: "1x1", ratio: 1, direction: "up" });
    expect(nearestGannAngle(-1)).toEqual({ label: "1x1", ratio: 1, direction: "down" });
    expect(nearestGannAngle(0.26)).toEqual({ label: "1x4", ratio: 0.25, direction: "up" });
    expect(nearestGannAngle(3.9)).toEqual({ label: "4x1", ratio: 4, direction: "up" });
  });

  it("returns null for a non-finite slope", () => {
    expect(nearestGannAngle(NaN)).toBeNull();
  });
});

// C-LEVELS-20 (Jensen, Astro-Cycles, printed pp.~124-125): every calendar day
// on the chart, non-trading days blank, one day's width equal to one price unit.
describe("one price unit per calendar day", () => {
  it("rises $7 over a calendar week of five sessions on a $1-per-day scale", () => {
    // Monday to the next Monday: five sessions, seven calendar days.
    expect(calendarDayOneByOne(100, "2026-10-05T04:00:00Z", "2026-10-12T04:00:00Z", 1, "up")).toBeCloseTo(107, 9);
  });

  it("falls the same way from a high", () => {
    expect(calendarDayOneByOne(100, "2026-10-05T04:00:00Z", "2026-10-12T04:00:00Z", 2, "down")).toBeCloseTo(86, 9);
  });

  it("reads price against the calendar-day line from the last low and high, as context", () => {
    const bars = Array.from({ length: 40 }, (_, i) => {
      const c = 100 + 8 * Math.sin(i / 4);
      return { t: new Date(Date.UTC(2026, 0, 5) + i * 86_400_000).toISOString(), o: c, h: c + 0.5, l: c - 0.5, c, v: 1e6 };
    });
    const r = readCalendarDayAngles(bars, bars[bars.length - 1].c)!;
    expect(r.fromLow).not.toBeNull();
    expect(r.fromLow!.price).toBeCloseTo(r.fromLow!.anchorPrice + r.fromLow!.calendarDays * r.unit, 9);
    expect(typeof r.fromLow!.priceAbove).toBe("boolean");
  });
});

describe("the calendar-day line as a measured context factor", () => {
  it("is on the disclosed-rules reading and counts with a long over the rising line", async () => {
    const { readDisclosedRules } = await import("../disclosedRules");
    const { contextFactorsFor } = await import("../contextFactors");
    const bars = Array.from({ length: 60 }, (_, i) => {
      const c = 100 + 8 * Math.sin(i / 4);
      return { t: new Date(Date.UTC(2026, 0, 5) + i * 86_400_000).toISOString(), o: c, h: c + 0.5, l: c - 0.5, c, v: 1e6 };
    });
    const ctx = readDisclosedRules(bars, bars[bars.length - 1].c);
    const line = ctx.calendarDayAngles!.fromLow!.price;
    expect(contextFactorsFor(ctx, "bullish", line + 1).calendarDayAngleAgreesWithTrade).toBe(true);
    expect(contextFactorsFor(ctx, "bullish", line - 1).calendarDayAngleAgreesWithTrade).toBe(false);
  });
});

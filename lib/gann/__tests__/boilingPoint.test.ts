import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { computeBoilingPoint, computeRunBoilingPoint } from "../boilingPoint";
import { readDisclosedRules, describeDisclosedRules } from "../disclosedRules";
import { contextFactorsFor } from "../contextFactors";
import type { VolumeClimaxReading } from "../volumeClimax";

function dailyBars(count: number): Bar[] {
  return Array.from({ length: count }, (_, i) => ({
    t: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(),
    o: 100,
    h: 101,
    l: 99,
    c: 100,
    v: 1000,
  }));
}

function climaxReading(anchorIndex: number, climax = true): VolumeClimaxReading {
  return { anchorKind: "low", anchorPrice: 100, anchorIndex, relativeVolume: 2, bestRecentRelativeVolume: 2, climax, dryingUp: false, retestOnLowerVolume: false, confirms: climax };
}

describe("computeBoilingPoint", () => {
  it("returns empty for no bars", () => {
    expect(computeBoilingPoint([], [climaxReading(0)])).toEqual([]);
  });

  it("skips a non-climax reading -- nothing to measure a blow-off duration from", () => {
    const bars = dailyBars(30);
    expect(computeBoilingPoint(bars, [climaxReading(0, false)])).toEqual([]);
  });

  it("reads under 6 weeks since the anchor as developing", () => {
    const bars = dailyBars(30); // anchor at index 0, 29 days = ~4.1 weeks later
    const [reading] = computeBoilingPoint(bars, [climaxReading(0)]);
    expect(reading.phase).toBe("developing");
  });

  it("reads 6-7 weeks since the anchor as classic", () => {
    const bars = dailyBars(50); // anchor at index 0, 49 days = 7 weeks later
    const [reading] = computeBoilingPoint(bars, [climaxReading(0)]);
    expect(reading.phase).toBe("classic");
    expect(reading.weeksSinceClimax).toBe(7);
  });

  it("reads 7-10 weeks since the anchor as extended", () => {
    const bars = dailyBars(63); // 62 days = ~8.9 weeks
    const [reading] = computeBoilingPoint(bars, [climaxReading(0)]);
    expect(reading.phase).toBe("extended");
  });

  it("reads 10+ weeks since the anchor as overrun", () => {
    const bars = dailyBars(100); // 99 days = 14.1 weeks
    const [reading] = computeBoilingPoint(bars, [climaxReading(0)]);
    expect(reading.phase).toBe("overrun");
  });
});

/** Daily bars from 2026-01-01: a 40-day fall to a low, then `up` days of rise. */
function fallThenRise(up: number): Bar[] {
  const closes = [...Array.from({ length: 41 }, (_, i) => 200 - i), ...Array.from({ length: up }, (_, i) => 161 + i)];
  return closes.map((c, i) => ({ t: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(), o: c, h: c + 0.5, l: c - 0.5, c, v: 1000 }));
}

describe("computeRunBoilingPoint (M-T10: weeks from where the run began)", () => {
  it("counts weeks from the weekly swing bottom the advance started from", () => {
    const r = computeRunBoilingPoint(fallThenRise(49));
    expect(r).toMatchObject({ run: "up", anchorKind: "low", startDate: "2026-02-10", weeksSinceStart: 7, phase: "classic" });
    expect(computeRunBoilingPoint(fallThenRise(30))?.phase).toBe("developing");
    expect(computeRunBoilingPoint(fallThenRise(60))?.phase).toBe("extended");
    expect(computeRunBoilingPoint(fallThenRise(80))?.phase).toBe("overrun");
  });

  it("keeps the climax anchor beside it, unchanged", () => {
    const bars = fallThenRise(49);
    const climax = computeBoilingPoint(bars, [{ anchorKind: "low", anchorPrice: 160, anchorIndex: 45, relativeVolume: 2, bestRecentRelativeVolume: 2, climax: true, dryingUp: false, retestOnLowerVolume: false, confirms: true }]);
    expect(climax[0].weeksSinceClimax).toBe(6.3);
  });

  it("is a measured factor in the run's direction, and a card line", () => {
    const bars = fallThenRise(49);
    const last = bars[bars.length - 1];
    const ctx = readDisclosedRules(bars, last.c, null, new Date(last.t));
    expect(contextFactorsFor(ctx, "bullish", last.c).boilingRunClassicWithTrade).toBe(true);
    expect(contextFactorsFor(ctx, "bearish", last.c).boilingRunClassicWithTrade).toBe(false);
    expect(describeDisclosedRules(ctx).some((l) => l.startsWith("7 weeks since the advance began"))).toBe(true);
  });
});

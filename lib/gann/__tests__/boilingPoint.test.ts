import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { computeBoilingPoint } from "../boilingPoint";
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
  return { anchorKind: "low", anchorPrice: 100, anchorIndex, relativeVolume: 2, bestRecentRelativeVolume: 2, climax };
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

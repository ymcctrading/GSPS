import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { readCloseCluster } from "../closeCluster";
import { readSquareOf144, STRONG_POINTS } from "../squareOf144";

const DAY = 86_400_000;
const start = Date.UTC(2025, 0, 1);
function bar(i: number, c: number, spread = 0.5): Bar {
  return { t: new Date(start + i * DAY).toISOString(), o: c, h: c + spread, l: c - spread, c, v: 1000 };
}

describe("readCloseCluster (Master Course Ch. 3, Rule 8)", () => {
  it("finds three closes around one price and the break that followed", () => {
    const closes = [40, 41, 42, 45, 45.1, 44.9, 46.2];
    const r = readCloseCluster(closes.map((c, i) => bar(i, c)), "daily")!;
    expect(r.price).toBeCloseTo(45);
    expect(r.barsSince).toBe(1);
    expect(r.breakout).toBe("up");
  });

  it("reports a cluster still unbroken", () => {
    const r = readCloseCluster([40, 42, 45, 45.2, 44.9].map((c, i) => bar(i, c)), "daily")!;
    expect(r.breakout).toBeNull();
    expect(r.barsSince).toBe(0);
  });

  it("ignores closes spread wider than a point", () => {
    expect(readCloseCluster([40, 43, 46, 49, 52].map((c, i) => bar(i, c)), "daily")).toBeNull();
  });

  it("ignores a cluster older than the timeframe's recent window", () => {
    const closes = [45, 45.1, 44.9, 47, 49, 51, 53, 55, 57, 59, 61];
    expect(readCloseCluster(closes.map((c, i) => bar(i, c)), "daily")).toBeNull();
  });
});

describe("readSquareOf144 (Master Course Ch. 13)", () => {
  it("lists the strongest points of the square", () => {
    expect([...STRONG_POINTS]).toEqual([36, 48, 54, 72, 90, 96, 108, 126, 144]);
  });

  it("counts days from the low landing on ½ of 144 and on a multiple of the low price", () => {
    // Low of 36 on day 0, rising after; 72 days later is ½ of 144 and 2 × the low price.
    const bars: Bar[] = [];
    for (let i = 0; i <= 72; i++) bars.push(bar(i, 36.5 + i * 0.1));
    const r = readSquareOf144(bars)!;
    expect(r.low.price).toBeCloseTo(36);
    const fromLow = r.hits.filter((h) => h.anchor === "low" && h.unit === "days");
    expect(fromLow.map((h) => h.label)).toEqual(expect.arrayContaining(["½ of 144", "2 × the low price"]));
  });

  it("projects the next date where two counts converge", () => {
    const bars: Bar[] = [];
    for (let i = 0; i <= 60; i++) bars.push(bar(i, 36.5 + i * 0.1));
    const r = readSquareOf144(bars)!;
    // Day 72 is ½ of 144 and 2 × the low; the ±1-day allowance opens the window on day 71.
    expect(r.nextConvergence?.date).toBe(new Date(start + 71 * DAY).toISOString().slice(0, 10));
  });

  it("reads price passing into a new square of 144", () => {
    const bars: Bar[] = [];
    for (let i = 0; i < 30; i++) bars.push(bar(i, 140 + i * 0.3));
    const r = readSquareOf144(bars)!;
    expect(r.passedSquare).toBeNull(); // 144 crossed more than five bars ago
    const later = [...bars.slice(0, 25), bar(25, 143), bar(26, 145)];
    expect(readSquareOf144(later)!.passedSquare).toEqual({ level: 144, direction: "up" });
  });

  it("skips the price reading where a point is wider than a sixteenth of the square", () => {
    const bars: Bar[] = [];
    for (let i = 0; i < 30; i++) bars.push(bar(i, 2000 + i));
    expect(readSquareOf144(bars)!.price).toBeNull();
  });
});

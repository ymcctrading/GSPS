import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { readCloseCluster } from "../closeCluster";

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

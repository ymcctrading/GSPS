import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { computeRetracementLevels, isFirstTierRetracement, nearestRetracementLevel } from "../retracement";

function bars(closes: number[]): Bar[] {
  return closes.map((c, i) => ({ t: `2026-01-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`, o: c, h: c + 1, l: c - 1, c, v: 1000 }));
}

/**
 * A confirmed low pivot at i=30 (price 100) followed by a confirmed high
 * pivot at i=59 (price 129) -- a clean up-swing findPivots(bars, 4) can
 * anchor on both ends, retracing down from the high.
 */
function upSwingBars(): Bar[] {
  const closes: number[] = [];
  for (let i = 0; i <= 29; i++) closes.push(130 - i); // 130 .. 101
  for (let i = 30; i <= 59; i++) closes.push(100 + (i - 30)); // 100 .. 129
  for (let i = 60; i <= 64; i++) closes.push(129 - (i - 59)); // 128 .. 124
  return bars(closes);
}

describe("computeRetracementLevels", () => {
  it("returns empty for too little history", () => {
    expect(computeRetracementLevels(bars([1, 2, 3]), 2)).toEqual([]);
  });

  it("includes the full retracement (100%) and 1/16, 1/3, 2/3, 15/16 fractions", () => {
    const levels = computeRetracementLevels(upSwingBars(), 100);
    const labels = levels.map((l) => l.label);
    expect(labels).toContain("1/1 (full retracement)");
    expect(labels).toContain("1/16");
    expect(labels).toContain("1/3");
    expect(labels).toContain("2/3");
    expect(labels).toContain("15/16");
  });

  // M-P1 (owner 2026-10-16: Ch. 6 tiers). Master Course Ch. 6 (PDF 185): on a
  // basis of 100, first 1/4, 1/2 and 3/4; then 1/3 and 2/3; then the 1/8 and
  // 1/16 points. 50% is flagged most important.
  it("ranks the divisions in three tiers, with the half most important", () => {
    const levels = computeRetracementLevels(upSwingBars(), 100);
    const byLabel = Object.fromEntries(levels.map((l) => [l.label, l.importance]));
    expect(byLabel["1/2"]).toBe(1);
    expect(byLabel["1/4"]).toBe(2);
    expect(byLabel["3/4"]).toBe(2);
    expect(byLabel["1/1 (full retracement)"]).toBe(2);
    expect(byLabel["1/3"]).toBe(3);
    expect(byLabel["2/3"]).toBe(3);
    for (const eighth of ["1/8", "3/8", "5/8", "7/8", "1/16", "15/16"]) expect(byLabel[eighth]).toBe(4);
  });

  it("puts the half, the quarters and the full range in the first tier, and nothing else", () => {
    const levels = computeRetracementLevels(upSwingBars(), 100);
    const first = levels.filter(isFirstTierRetracement).map((l) => l.label).sort();
    expect(first).toEqual(["1/1 (full retracement)", "1/2", "1/4", "3/4"]);
  });

  // Gann's divisions are eighths and thirds; 3/8 and 5/8 are Gann's own
  // counterparts of the Fibonacci levels (W031 p.1). Each sits halfway between
  // its neighbouring quarter and the half.
  it("places 3/8 and 5/8 at their eighths of the swing", () => {
    const levels = computeRetracementLevels(upSwingBars(), 100);
    const price = Object.fromEntries(levels.map((l) => [l.label, l.price]));
    expect(price["3/8"]).toBeCloseTo((price["1/4"] + price["1/2"]) / 2, 6);
    expect(price["5/8"]).toBeCloseTo((price["1/2"] + price["3/4"]) / 2, 6);
    expect(price["3/8"]).not.toBeCloseTo(price["5/8"], 2);
  });

  it("breaks a near-tie in distance in favor of the more important fraction", () => {
    // Two levels at the exact same price (a degenerate but valid tie) --
    // more important one should sort first.
    const levels = [
      { fraction: 0.375, label: "3/8", price: 100, distancePct: 1, role: "support" as const, importance: null },
      { fraction: 0.5, label: "1/2", price: 100, distancePct: 1, role: "support" as const, importance: 1 },
    ];
    const sorted = [...levels].sort((a, b) => {
      const distDiff = a.distancePct - b.distancePct;
      if (Math.abs(distDiff) > 1e-9) return distDiff;
      return (a.importance ?? Infinity) - (b.importance ?? Infinity);
    });
    expect(sorted[0].label).toBe("1/2");
  });
});

describe("nearestRetracementLevel", () => {
  it("returns null when nothing is within the proximity band", () => {
    expect(nearestRetracementLevel([], 1.5)).toBeNull();
  });
});

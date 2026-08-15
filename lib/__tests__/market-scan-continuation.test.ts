import { describe, expect, it } from "vitest";
import { hasExceptional4hMomentum } from "@/lib/marketScan";
import type { Bar } from "@/lib/types";

function bar(h: number, l: number, v: number): Bar {
  return { t: "2026-08-10T00:00:00Z", o: (h + l) / 2, h, l, c: (h + l) / 2, v };
}

/** 20 quiet baseline bars: range 1, volume 1000. */
function baseline(count = 20): Bar[] {
  return Array.from({ length: count }, () => bar(101, 100, 1000));
}

describe("hasExceptional4hMomentum", () => {
  it("requires both a range spike and a volume spike in the last bar", () => {
    const bars = [...baseline(), bar(103, 100, 2500)]; // range 3x, volume 2.5x
    expect(hasExceptional4hMomentum(bars)).toBe(true);
  });

  it("rejects a wide bar on ordinary volume — a gap, not participation", () => {
    const bars = [...baseline(), bar(103, 100, 1100)]; // range 3x, volume 1.1x
    expect(hasExceptional4hMomentum(bars)).toBe(false);
  });

  it("rejects heavy volume in a narrow bar — absorption, not a breakout", () => {
    const bars = [...baseline(), bar(101, 100, 3000)]; // range 1x, volume 3x
    expect(hasExceptional4hMomentum(bars)).toBe(false);
  });

  it("rejects an ordinary bar that clears neither threshold", () => {
    const bars = [...baseline(), bar(101.2, 100, 1100)];
    expect(hasExceptional4hMomentum(bars)).toBe(false);
  });

  it("returns false with too little history to establish a baseline", () => {
    expect(hasExceptional4hMomentum(baseline(10))).toBe(false);
  });

  it("returns false when the baseline itself is flat (zero range or volume)", () => {
    const flat = Array.from({ length: 20 }, () => bar(100, 100, 0));
    expect(hasExceptional4hMomentum([...flat, bar(103, 100, 2500)])).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { readSevenZones } from "@/lib/gann/sevenZones";

function series(n: number, step: (i: number) => { c: number; r: number; gap?: number }): Bar[] {
  const t0 = Date.parse("2025-01-01T00:00:00Z");
  const out: Bar[] = [];
  for (let i = 0; i < n; i++) {
    const { c, r, gap = 0 } = step(i);
    out.push({ t: new Date(t0 + i * 86_400_000).toISOString(), o: c - gap, h: c + r / 2, l: c - r / 2, c, v: 1e6 });
  }
  return out;
}

describe("readSevenZones", () => {
  it("reads a flat, narrow market as the normal zone", () => {
    const bars = series(260, (i) => ({ c: 100 + (i % 2 ? 0.2 : -0.2), r: 1 }));
    expect(readSevenZones(bars)?.zone).toBe(0);
  });

  it("reads a quiet advance as zone 1 and a feverish one as zone 3", () => {
    // Choppy history, then a steady rise with small ranges.
    const quiet = series(260, (i) => (i < 200 ? { c: 100 + Math.sin(i / 3) * 4, r: 2 } : { c: 100 + (i - 200) * 0.3 + Math.sin((i - 200) / 1.6) * 0.8, r: 1.6 }));
    expect(readSevenZones(quiet)?.zone).toBe(1);
    const wild = series(260, (i) => (i < 200 ? { c: 100 + Math.sin(i / 3) * 4, r: 2 } : { c: 100 + (i - 200) * 2 + Math.sin((i - 200) / 1.6) * 5, r: 10 }));
    expect(readSevenZones(wild)?.zone).toBe(3);
  });

  it("mirrors below normal for a decline", () => {
    const fall = series(260, (i) => (i < 200 ? { c: 200 + Math.sin(i / 3) * 4, r: 2 } : { c: 200 - (i - 200) * 2 + Math.sin((i - 200) / 1.6) * 5, r: 10 }));
    expect(readSevenZones(fall)?.zone).toBe(-3);
  });
});

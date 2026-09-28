import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { readSeasonalCount } from "@/lib/gann/seasonalCounts";
import { readAccumulation } from "@/lib/gann/accumulation";
import { readLeadership } from "@/lib/gann/leadership";
import { readSharesPerPoint } from "@/lib/gann/sharesPerPoint";

function bars(closes: number[], vol: (i: number) => number = () => 1e6, start = "2025-01-01"): Bar[] {
  const t0 = Date.parse(`${start}T00:00:00Z`);
  return closes.map((c, i) => ({ t: new Date(t0 + i * 86_400_000).toISOString(), o: c, h: c + 0.5, l: c - 0.5, c, v: vol(i) }));
}

describe("seasonal counts from March 21", () => {
  it("ranks the half year first and finds the midseason points", () => {
    expect(readSeasonalCount(new Date("2026-09-23T15:00:00Z"))?.point.label).toBe("½");
    expect(readSeasonalCount(new Date("2026-08-05T15:00:00Z"))?.point.rank).toBe(4);
    expect(readSeasonalCount(new Date("2026-10-15T15:00:00Z"))).toBeNull();
  });
});

describe("accumulation time", () => {
  it("counts the weeks in a range and reads the breakout", () => {
    const flat = Array.from({ length: 90 }, (_, i) => 100 + (i % 4) - 1.5);
    const r = readAccumulation(bars([...flat, 106]));
    expect(r?.breakout).toBe("up");
    expect(r!.weeks).toBeGreaterThanOrEqual(10);
    expect(r?.long).toBe(true);
  });
});

describe("leadership", () => {
  it("marks a stock that bottomed well before the market as an early leader", () => {
    const stock = bars(Array.from({ length: 120 }, (_, i) => (i < 30 ? 100 - i : 70 + (i - 30) * 0.5)));
    const market = bars(Array.from({ length: 120 }, (_, i) => (i < 70 ? 400 - i : 330 + (i - 70) * 0.5)));
    const r = readLeadership(stock, market);
    expect(r?.bottomedFirst).toBe(true);
    expect(r?.bottomedLate).toBe(false);
  });

  it("works without the market series", () => {
    const stock = bars(Array.from({ length: 120 }, (_, i) => 100 + i * 0.1));
    expect(readLeadership(stock, null)?.bottomedFirst).toBe(false);
  });
});

describe("shares per point", () => {
  it("returns a reading or null without throwing on a rising campaign", () => {
    const closes = Array.from({ length: 200 }, (_, i) => 100 + i * 0.4 + Math.sin(i / 4) * 3);
    const r = readSharesPerPoint(bars(closes, (i) => (i > 170 ? 5e6 : 1e6)));
    if (r) expect(r.ratio).toBeGreaterThan(0);
  });
});

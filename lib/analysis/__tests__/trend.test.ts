/**
 * readTrend is the trend read behind every macro (monthly/weekly/daily) trend
 * in the live scan and the replay. It had no test of its own (NOTES.md,
 * 2026-10-15).
 *
 * The rule it carries is Gann's: higher tops with higher bottoms mean an
 * uptrend, lower tops with lower bottoms a downtrend (*New Stock Trend
 * Detector*, W006 pp.19-20). Anything not confirmed reads "sideways". Old
 * bottoms below the price are support and old tops above it resistance
 * (W006 pp.13, 24, 40-41).
 */
import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { readTrend } from "@/lib/analysis/trend";

function daily(closes: number[]): Bar[] {
  return closes.map((c, i) => ({
    t: new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString(),
    o: c,
    h: c + 1,
    l: c - 1,
    c,
    v: 1000,
  }));
}

/** 8 bars up 0.8, 3 bars down 0.4: rising tops and rising bottoms. */
function stepping(n: number, sign: 1 | -1): number[] {
  const out: number[] = [];
  let p = 100;
  for (let i = 0; i < n; i++) {
    p += sign * (i % 11 < 8 ? 0.8 : -0.4);
    out.push(p);
  }
  return out;
}

describe("readTrend (W006 pp.19-20)", () => {
  it("reads rising tops and bottoms as bullish", () => {
    const r = readTrend(daily(stepping(120, 1)), "1Day");
    expect(r.direction).toBe("bullish");
    expect(r.timeframe).toBe("1Day");
  });

  it("reads falling tops and bottoms as bearish (the mirror)", () => {
    expect(readTrend(daily(stepping(120, -1)), "1Week").direction).toBe("bearish");
  });

  it("reads flat tops and bottoms as sideways", () => {
    const flat = Array.from({ length: 120 }, (_, i) => {
      const phase = i % 8;
      return 96 + (phase < 4 ? phase : 7 - phase) * 2;
    });
    expect(readTrend(daily(flat), "1Day").direction).toBe("sideways");
  });

  it("lists old bottoms below the price as support and old tops above it as resistance", () => {
    // Up to 120, back down to 100, up to 115, down to 105: the old top at 120
    // is overhead, the old bottom at 100 underneath.
    const closes = [
      ...Array.from({ length: 21 }, (_, i) => 100 + i),
      ...Array.from({ length: 20 }, (_, i) => 119 - i),
      ...Array.from({ length: 15 }, (_, i) => 101 + i),
      ...Array.from({ length: 10 }, (_, i) => 114 - i),
    ];
    const r = readTrend(daily(closes), "1Day");
    const last = closes[closes.length - 1];
    expect(r.support.length).toBeGreaterThan(0);
    expect(r.resistance.length).toBeGreaterThan(0);
    for (const s of r.support) expect(s).toBeLessThan(last);
    for (const s of r.resistance) expect(s).toBeGreaterThan(last);
    expect(r.resistance.some((p) => Math.abs(p - 121) <= 1)).toBe(true);
    expect(r.support.some((p) => Math.abs(p - 99) <= 1)).toBe(true);
  });
});

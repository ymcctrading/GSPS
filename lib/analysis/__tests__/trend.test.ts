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

/** Straight legs between closes, one bar per step of 1. */
function legs(points: number[]): number[] {
  const out: number[] = [points[0]];
  for (let k = 1; k < points.length; k++) {
    const [a, b] = [points[k - 1], points[k]];
    const n = Math.max(1, Math.round(Math.abs(b - a)));
    for (let i = 1; i <= n; i++) out.push(a + ((b - a) * i) / n);
  }
  return out;
}

describe("A-LEVELS-01: old tops become bottoms, old bottoms become tops (W006 p.13)", () => {
  it("puts an old top crossed by the 3 points into support", () => {
    // A top at 100 (high 101), a dip, a close at 110, back to 103.
    const r = readTrend(daily(legs([80, 100, 92, 110, 103])), "1Day");
    expect(r.support.some((p) => Math.abs(p - 101) < 0.5)).toBe(true);
    expect(r.resistance.some((p) => Math.abs(p - 101) < 0.5)).toBe(false);
  });

  it("puts an old bottom broken by the 3 points into resistance", () => {
    const r = readTrend(daily(legs([120, 100, 108, 90, 97])), "1Day");
    expect(r.resistance.some((p) => Math.abs(p - 99) < 0.5)).toBe(true);
    expect(r.support.some((p) => Math.abs(p - 99) < 0.5)).toBe(false);
  });

  it("does not flip a top that closes have not yet cleared by the 3 points", () => {
    // 3 points at 101 are about 5; the best close is 104.
    const r = readTrend(daily(legs([80, 100, 92, 104, 102])), "1Day");
    expect(r.support.some((p) => Math.abs(p - 101) < 0.5)).toBe(false);
  });
});

describe("A-LEVELS-05: in a bear market an old top below price is support (W006 p.24)", () => {
  it("reads the 1916-style 110 top as support once the market fell back toward it", () => {
    // 110 top, far above it, then a fall to 113: the old 110 top (high 111) is support.
    const r = readTrend(daily(legs([90, 110, 100, 150, 130, 140, 113])), "1Day");
    expect(r.support.some((p) => Math.abs(p - 111) < 1)).toBe(true);
  });

  it("needs the crossing after the top: closes beyond it before it printed do not count", () => {
    // Earlier prices far over 100, a fall, a 100 top, then price only just over it.
    const r = readTrend(daily(legs([130, 85, 100, 92, 102])), "1Day");
    expect(r.support.some((p) => Math.abs(p - 101) < 1)).toBe(false);
  });
});

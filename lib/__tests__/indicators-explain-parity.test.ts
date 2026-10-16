/**
 * The chart lines added for the explain view (VWAP, Donchian, Stochastic)
 * must plot the same values the explain reading uses (lib/strategies/math.ts),
 * or the line on the chart and the sentence under the plan disagree.
 */
import { describe, it, expect } from "vitest";
import { donchian, stochastic, vwap, type Candle } from "@/lib/indicators";
import * as math from "@/lib/strategies/math";
import type { Bar } from "@/lib/types";

function bars(n: number, stepMs: number): Bar[] {
  const t0 = Date.parse("2026-09-28T13:30:00Z");
  return Array.from({ length: n }, (_, i) => {
    const c = 100 + 5 * Math.sin(i / 4) + i * 0.05;
    return {
      t: new Date(t0 + i * stepMs).toISOString(),
      o: c - 0.3,
      h: c + 1 + (i % 3) * 0.2,
      l: c - 1 - (i % 5) * 0.1,
      c,
      v: 1000 + (i % 7) * 50,
    };
  });
}

function candles(b: Bar[]): Candle[] {
  return b.map((x) => ({
    time: Date.parse(x.t) / 1000,
    open: x.o,
    high: x.h,
    low: x.l,
    close: x.c,
    volume: x.v,
  }));
}

describe("explain chart lines match the reading's math", () => {
  const b = bars(120, 15 * 60_000); // 15-minute bars over two UTC days
  const c = candles(b);

  it("VWAP restarts each session and matches the latest session's value", () => {
    const line = vwap(c);
    const expected = math.vwap(math.latestSession(b));
    expect(line[line.length - 1].value).toBeCloseTo(
      expected[expected.length - 1] as number,
      8,
    );
  });

  it("Donchian matches", () => {
    const { upper, lower } = donchian(c, 20);
    const ref = math.donchian(b, 20);
    const last = ref[ref.length - 1]!;
    expect(upper[upper.length - 1].value).toBeCloseTo(last.upper, 8);
    expect(lower[lower.length - 1].value).toBeCloseTo(last.lower, 8);
  });

  it("Stochastic matches", () => {
    const { k, d } = stochastic(c, 14, 3, 3);
    const ref = math.stochastic(b, 14, 3, 3);
    const last = ref[ref.length - 1]!;
    expect(k[k.length - 1].value).toBeCloseTo(last.k, 8);
    expect(d[d.length - 1].value).toBeCloseTo(last.d, 8);
  });
});

describe("latestSession", () => {
  it("keeps only bars on the last bar's UTC date", () => {
    const b = bars(120, 15 * 60_000);
    const s = math.latestSession(b);
    const day = b[b.length - 1].t.slice(0, 10);
    expect(s.length).toBeGreaterThan(0);
    expect(s.every((x) => x.t.startsWith(day))).toBe(true);
    expect(b.length - s.length).toBeGreaterThan(0);
  });
});

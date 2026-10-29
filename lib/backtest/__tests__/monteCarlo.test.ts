import { describe, expect, it } from "vitest";
import { defaultBlockLength, monteCarloResample, type MonteCarloTrade } from "@/lib/backtest/monteCarlo";

function trade(i: number, r: number, extra: Partial<MonteCarloTrade> = {}): MonteCarloTrade {
  const day = String(1 + (i % 28)).padStart(2, "0");
  const month = String(1 + Math.floor(i / 28)).padStart(2, "0");
  return {
    symbol: "AAA",
    openedAt: `2026-${month}-${day}T14:30:00.000Z`,
    rMultiple: r,
    outcome: r > 0 ? "win" : "loss",
    exitReason: "stop",
    ...extra,
  } as MonteCarloTrade;
}

describe("monteCarloResample", () => {
  it("returns null below two closed trades", () => {
    expect(monteCarloResample([])).toBeNull();
    expect(monteCarloResample([trade(0, 1)])).toBeNull();
    expect(monteCarloResample([trade(0, 1), trade(1, -1, { exitReason: "open_at_end" })])).toBeNull();
  });

  it("leaves open-at-end trades out and counts them", () => {
    const ts = [trade(0, 1), trade(1, -1), trade(2, 5, { exitReason: "open_at_end", outcome: "timeout" })];
    const mc = monteCarloResample(ts, { resamples: 200 })!;
    expect(mc.n).toBe(2);
    expect(mc.excludedOpenAtEnd).toBe(1);
    expect(mc.observed.totalR).toBe(0);
  });

  it("reads the run's own order for the observed figures", () => {
    // +1, -1, -1, -1, +2: drawdown 3 (from 1 down to -2), three losses in a row.
    const ts = [1, -1, -1, -1, 2].map((r, i) => trade(i, r));
    // Shuffle the input; the module sorts by openedAt.
    const mc = monteCarloResample([ts[3], ts[0], ts[4], ts[2], ts[1]], { resamples: 100 })!;
    expect(mc.observed).toEqual({ expectancyR: 0, totalR: 0, maxDrawdownR: 3, longestLosingStreak: 3 });
  });

  it("is deterministic for a seed and different across seeds", () => {
    const ts = Array.from({ length: 60 }, (_, i) => trade(i, (i * 7919) % 5 === 0 ? 2 : -0.5));
    const a = monteCarloResample(ts, { seed: 1 });
    const b = monteCarloResample(ts, { seed: 1 });
    const c = monteCarloResample(ts, { seed: 2 });
    expect(a).toEqual(b);
    expect(c?.maxDrawdownR).not.toEqual(a?.maxDrawdownR);
  });

  it("keeps the total fixed when every trade is drawn once, and orders the bands", () => {
    const ts = Array.from({ length: 50 }, (_, i) => trade(i, i % 3 === 0 ? 1.5 : -0.5));
    // A block as long as the list draws one rotation of it: the same trades, the same total.
    const whole = monteCarloResample(ts, { blockLength: 50, resamples: 300 })!;
    expect(whole.totalR.p5).toBeCloseTo(whole.observed.totalR, 9);
    expect(whole.totalR.p95).toBeCloseTo(whole.observed.totalR, 9);

    const mc = monteCarloResample(ts, { resamples: 2000 })!;
    for (const k of ["expectancyR", "totalR", "maxDrawdownR", "longestLosingStreak"] as const) {
      expect(mc[k].p5).toBeLessThanOrEqual(mc[k].p50);
      expect(mc[k].p50).toBeLessThanOrEqual(mc[k].p95);
    }
    expect(mc.blockLength).toBe(defaultBlockLength(50));
    expect(mc.shareNonPositiveExpectancy).toBeGreaterThanOrEqual(0);
    expect(mc.shareNonPositiveExpectancy).toBeLessThanOrEqual(1);
  });

  it("keeps clustered losses together better than single-trade draws", () => {
    // 20 losses in one stretch, then 80 wins: the run's own streak is 20.
    const ts = Array.from({ length: 100 }, (_, i) => trade(i, i < 20 ? -1 : 0.5));
    const blocks = monteCarloResample(ts, { blockLength: 10, resamples: 2000 })!;
    const singles = monteCarloResample(ts, { blockLength: 1, resamples: 2000 })!;
    expect(blocks.observed.longestLosingStreak).toBe(20);
    expect(blocks.longestLosingStreak.p50).toBeGreaterThan(singles.longestLosingStreak.p50);
    expect(blocks.maxDrawdownR.p50).toBeGreaterThan(singles.maxDrawdownR.p50);
  });

  it("reads every resample at or below zero when every trade loses", () => {
    const ts = Array.from({ length: 10 }, (_, i) => trade(i, -1));
    const mc = monteCarloResample(ts, { resamples: 100 })!;
    expect(mc.shareNonPositiveExpectancy).toBe(1);
    expect(mc.longestLosingStreak.p50).toBe(10);
  });

  it("counts a non-finite R apart, clamps the block to n, and lets a timeout break a streak", () => {
    const ts = [
      trade(0, -1),
      trade(1, -1),
      trade(2, 0, { outcome: "timeout", exitReason: "held_to_limit" }),
      trade(3, -1),
      trade(4, Number.NaN),
    ];
    const mc = monteCarloResample(ts, { blockLength: 99, resamples: 50 })!;
    expect(mc.n).toBe(4);
    expect(mc.excludedNonFinite).toBe(1);
    expect(mc.blockLength).toBe(4);
    expect(mc.observed.longestLosingStreak).toBe(2);
    expect(mc.observed.maxDrawdownR).toBe(3);
  });
});

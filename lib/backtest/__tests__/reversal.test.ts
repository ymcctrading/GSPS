import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { walkReversals } from "../replay";
import { gannThreePoints } from "@/lib/gann/pointScale";

/** 15-minute candles from 14:30Z on 2026-03-02, one per close. */
function candles(closes: number[]): Bar[] {
  const start = Date.UTC(2026, 2, 2, 14, 30);
  return closes.map((c, i) => ({ t: new Date(start + i * 900_000).toISOString(), o: c, h: c + 0.1, l: c - 0.1, c, v: 1000 }));
}

describe("the replay's reversal when caught", () => {
  // A long caught at 100 (candle 0). Then: a touch of 100, a close under it,
  // a retest back up to it, a close under the retest's low, and the decline.
  const bars = candles([100, 100, 99.5, 100, 99.2, 98.8, 98.4, 98, 97.6, 97.2]);

  it("enters the opposite trade once it confirms, its stop 3 points over the old top", () => {
    const out = walkReversals({
      bars, dailyBars: [], caughtAt: 0, side: "long", cause: "initial", brokenLevel: 100, extreme: 104,
      maxBarsHeld: 20, costPerShare: 0,
    });
    expect(out).toHaveLength(1);
    expect(out[0].direction).toBe("bearish");
    expect(out[0].stop).toBeCloseTo(104 + gannThreePoints(104), 10);
    expect(out[0].reversal).toBe(1);
    expect(out[0].entry).toBeLessThan(100);
    expect(out[0].rMultiple).toBeGreaterThan(0);
  });

  it("does not reverse after the hold test fails", () => {
    const out = walkReversals({
      bars, dailyBars: [], caughtAt: 0, side: "long", cause: "hold_test_failed", brokenLevel: 100, extreme: 104,
      maxBarsHeld: 20, costPerShare: 0,
    });
    expect(out).toHaveLength(0);
  });

  it("does not carry an unconfirmed reversal into the next session", () => {
    const flat = candles([100, 100.2, 100.3, 100.4]);
    const out = walkReversals({
      bars: flat, dailyBars: [], caughtAt: 0, side: "long", cause: "initial", brokenLevel: 100, extreme: 104,
      maxBarsHeld: 20, costPerShare: 0,
    });
    expect(out).toHaveLength(0);
  });
});

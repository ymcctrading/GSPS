import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { rebuyPlanAt, walkRebuy, walkReversals } from "../replay";
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

/** 15-minute candles from 14:30Z on a given day, one per close. */
function candlesOn(day: number, closes: number[]): Bar[] {
  const start = Date.UTC(2026, 2, day, 14, 30);
  return closes.map((c, i) => ({ t: new Date(start + i * 900_000).toISOString(), o: c, h: c + 0.1, l: c - 0.1, c, v: 1000 }));
}

/** A rising daily zigzag through 2026-03-21 that the swing chart reads as up. */
function risingDaily(): Bar[] {
  const closes: number[] = [];
  let p = 50;
  for (let k = 0; k < 8; k++) {
    for (let i = 0; i < 6; i++) closes.push((p += 2));
    for (let i = 0; i < 4; i++) closes.push((p -= 1.5));
  }
  return closes.map((c, i) => ({ t: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(), o: c, h: c + 0.5, l: c - 0.5, c, v: 1 }));
}

describe("the replay's re-buy after a stop (A-PYRAMID-07, W022 p.198)", () => {
  it("rests a re-entry only while the swing chart still runs the trade's way, after a trailing stop", () => {
    const bars = candlesOn(23, [99, 98]);
    const up = rebuyPlanAt({ bars, dailyBars: risingDaily(), caughtAt: 0, side: "long", cause: "break_even", extreme: 100, entryPrice: 80 });
    expect(up?.side).toBe("long");
    expect(up!.entry).toBeLessThan(100);
    expect(rebuyPlanAt({ bars, dailyBars: risingDaily(), caughtAt: 0, side: "short", cause: "break_even", extreme: 100, entryPrice: 120 })).toBeNull();
    expect(rebuyPlanAt({ bars, dailyBars: risingDaily(), caughtAt: 0, side: "long", cause: "initial", extreme: 100, entryPrice: 80 })).toBeNull();
  });

  it("buys again when price reacts to the level, with the stop half the reaction below", () => {
    const bars = candlesOn(23, [99, 98, 96, 94.9, 96, 97, 98]);
    const r = walkRebuy({ bars, dailyBars: [], caughtAt: 0, plan: { side: "long", entry: 95, stop: 92, extreme: 100 }, maxBarsHeld: 20, costPerShare: 0 });
    expect(r?.rebuy).toBe(true);
    expect(r?.direction).toBe("bullish");
    // Confirmed on the candle that traded to 95, filled at the next open (rule 9).
    expect(r?.entry).toBe(96);
    expect(r?.stop).toBe(92);
    expect(r!.rMultiple).toBeGreaterThan(0);
  });

  it("calls the re-entry off on a candle that closes through its stop, as placement does", () => {
    const bars = candlesOn(23, [99, 98, 91.5, 93, 96]);
    expect(walkRebuy({ bars, dailyBars: [], caughtAt: 0, plan: { side: "long", entry: 95, stop: 92, extreme: 100 }, maxBarsHeld: 20, costPerShare: 0 })).toBeNull();
  });

  it("cancels the re-entry when price makes a new high before the reaction", () => {
    const bars = candlesOn(23, [99, 101, 96, 94.9, 96]);
    expect(walkRebuy({ bars, dailyBars: [], caughtAt: 0, plan: { side: "long", entry: 95, stop: 92, extreme: 100 }, maxBarsHeld: 20, costPerShare: 0 })).toBeNull();
  });

  it("covers a reversal opened at the stop where the re-entry rests", () => {
    const bars = candles([100, 100, 99.5, 100, 99.2, 98.8, 98.4, 98, 97.6, 97.2]);
    const out = walkReversals({
      bars, dailyBars: [], caughtAt: 0, side: "long", cause: "break_even", brokenLevel: 100, extreme: 104,
      maxBarsHeld: 20, costPerShare: 0, coverAt: 98.5,
    });
    expect(out).toHaveLength(1);
    expect(out[0].exitReason).toBe("covered");
  });
});

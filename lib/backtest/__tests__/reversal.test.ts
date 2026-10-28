import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { rebuyPlanAt, walkRebuy, walkReversals } from "../replay";
import { gannThreePoints } from "@/lib/gann/pointScale";
import { LOSS_SERIES_LENGTH } from "@/lib/risk/lossSeries";

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

describe("the replay's reversal chain stops on a series of losses (audit, NSTD Rule 6 and Rule 1)", () => {
  // One-minute candles in one session: each reversal confirms, then price runs
  // through its stop, wider each time, so every reversal in the chain loses.
  function whipsaw(): Bar[] {
    const seg = (lvl: number, down: boolean, to: number) => {
      const s = down ? -1 : 1;
      return [lvl, lvl + s * 0.5, lvl, lvl + s * 0.8, lvl + s * 1.2, lvl + s * 1.6, lvl - s * 2, to];
    };
    const closes = [100, ...seg(100, true, 122), ...seg(122, false, 88), ...seg(88, true, 135), ...seg(135, false, 75), ...seg(75, true, 150), ...seg(150, false, 60)];
    const start = Date.UTC(2026, 2, 2, 14, 30);
    return closes.map((c, i) => ({ t: new Date(start + i * 60_000).toISOString(), o: c, h: c + 0.1, l: c - 0.1, c, v: 1000 }));
  }
  const walk = (parentLost: boolean) =>
    walkReversals({
      bars: whipsaw(), dailyBars: [], caughtAt: 0, side: "long", cause: "initial", brokenLevel: 100, extreme: 104,
      maxBarsHeld: 200, costPerShare: 0, parentLost,
    });

  it("ends the chain on three losses in a row, the series-of-losses rule", () => {
    const out = walk(false);
    expect(out).toHaveLength(LOSS_SERIES_LENGTH);
    expect(out.every((t) => t.outcome === "loss")).toBe(true);
  });

  it("counts the caught trade's own loss as the first of the series", () => {
    expect(walk(true)).toHaveLength(LOSS_SERIES_LENGTH - 1);
  });

  it("resets the count on a win, so the chain runs past three reversals", () => {
    // The second reversal (long at about 123) runs past 1R to 160, where the
    // runner takes 60% off, and the rest is stopped: a small win, which starts
    // the series of losses over. Three losses after it end the chain at five,
    // where an unreset count would have stopped it at three.
    const s = (lvl: number, down: boolean, far: number, to: number) => {
      const d = down ? -1 : 1;
      return [lvl, lvl + d * 0.5, lvl, lvl + d * 0.8, lvl + d * 1.2, lvl + d * 1.6, far, to];
    };
    const closes = [100, ...s(100, true, 102, 122), ...s(122, false, 160, 90), ...s(90, true, 92, 140), ...s(140, false, 138, 60), ...s(60, true, 62, 170), ...s(170, false, 168, 40), ...s(40, true, 42, 200)];
    const start = Date.UTC(2026, 2, 2, 14, 30);
    const bars: Bar[] = closes.map((c, i) => ({ t: new Date(start + i * 60_000).toISOString(), o: c, h: c + 0.1, l: c - 0.1, c, v: 1000 }));
    const out = walkReversals({
      bars, dailyBars: [], caughtAt: 0, side: "long", cause: "initial", brokenLevel: 100, extreme: 104,
      maxBarsHeld: 500, costPerShare: 0, parentLost: true, runner: true,
    });
    expect(out.map((t) => t.outcome)).toEqual(["loss", "win", "loss", "loss", "loss"]);
    expect(out.length).toBeGreaterThan(LOSS_SERIES_LENGTH);
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

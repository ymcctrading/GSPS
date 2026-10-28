/**
 * The whole line's stop after a pyramid add goes 5 points under the add's own
 * fill (A-STOP-06, W022 p.198), in the replay as on the live add
 * (lib/automation/pyramid-adds.ts). Measured from the trigger, an add filled on
 * a gap past it kept a stop 5 points under the trigger instead.
 */
import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { walkGannExit } from "@/lib/backtest/replay";
import { readPyramidAdd } from "@/lib/gann/pyramid";
import { pricePoint } from "@/lib/gann/pointScale";

function days(closes: number[], start = "2026-06-01"): Bar[] {
  const t0 = Date.parse(`${start}T00:00:00Z`);
  return closes.map((c, i) => ({ t: new Date(t0 + i * 86_400_000).toISOString(), o: c, h: c + 0.5, l: c - 0.5, c, v: 1e6 }));
}

describe("the replay's whole-line stop after an add", () => {
  it("is 5 points under the add's fill when the add fills on a gap past its trigger", () => {
    // The pyramid tests' rise: a first lot at 101.8 on June 3 and a swing top since.
    const base = days([100, 101, 102, 104, 106, 108, 110, 109, 107, 105, 104, 106, 108, 111]);
    const add = readPyramidAdd({
      side: "long",
      lots: [{ qty: 100, price: 101.8, date: "2026-06-03" }],
      stop: 98.3,
      initialStop: 98.3,
      daily: base,
      price: 111,
    }).add!;
    // June 15 opens 3 dollars past the trigger, so the add fills at the open.
    const open = add.trigger + 3;
    const fillStop = open - 5 * pricePoint(open);
    expect(fillStop).toBeGreaterThan(add.newStop);
    // June 16 trades between the two stops: under the fill's, over the trigger's.
    const low = (fillStop + add.newStop) / 2;
    const bars: Bar[] = [
      ...base,
      { t: "2026-06-15T00:00:00.000Z", o: open, h: open + 0.5, l: open - 0.5, c: open, v: 1e6 },
      { t: "2026-06-16T00:00:00.000Z", o: open - 1, h: open - 0.5, l: low, c: low + 0.2, v: 1e6 },
    ];
    const r = walkGannExit({ bars, from: 2, maxBarsHeld: 30, long: true, entry: 101.8, stop: 98.3, dailyBars: bars, crossedLevel: null, pyramid: true });
    expect(r.lots).toBe(2);
    expect(r.reason).toBe("break_even");
    expect(r.finalExit).toBeCloseTo(fillStop, 6);
  });
});

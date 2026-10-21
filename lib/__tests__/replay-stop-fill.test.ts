/**
 * A stop a candle opens through fills at the open, not the stop. Filling every
 * gap at the stop made the loss side of the replay optimistic.
 */
import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { stopFill, walkGannExit } from "@/lib/backtest/replay";

const bar = (t: string, o: number, h: number, l: number, c: number): Bar => ({ t, o, h, l, c, v: 1000 });

describe("stopFill", () => {
  it("fills a long at the gap open below the stop, and a short at the gap open above it", () => {
    expect(stopFill(true, 95, 90)).toBe(90);
    expect(stopFill(true, 95, 97)).toBe(95);
    expect(stopFill(false, 105, 110)).toBe(110);
    expect(stopFill(false, 105, 103)).toBe(105);
  });
});

describe("walkGannExit", () => {
  it("leaves a long at the gap open when the session opens under the stop", () => {
    const bars = [
      bar("2026-10-19T14:30:00Z", 100, 101, 99.5, 100.5),
      bar("2026-10-19T14:45:00Z", 100.5, 101, 100, 100.8),
      bar("2026-10-19T15:00:00Z", 90, 91, 89, 90.5),
    ];
    const walked = walkGannExit({ bars, from: 0, maxBarsHeld: 10, long: true, entry: 100, stop: 95, dailyBars: [], crossedLevel: null });
    expect(walked.reason).toBe("initial");
    expect(walked.finalExit).toBe(90);
    expect(walked.exit).toBe(90);
  });
});

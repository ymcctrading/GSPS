import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { readTimeRules } from "@/lib/gann/timeRules";
import { readMultipleTops } from "@/lib/gann/multipleTops";

function bars(closes: number[]): Bar[] {
  const t0 = Date.parse("2026-01-01T00:00:00Z");
  return closes.map((c, i) => ({ t: new Date(t0 + i * 86_400_000).toISOString(), o: c, h: c + 0.5, l: c - 0.5, c, v: 1e6 }));
}

describe("time rules", () => {
  it("finds a two-day halt at a fresh top and puts the stop beyond it", () => {
    const closes = [...Array.from({ length: 22 }, (_, i) => 100 + i), 120.5, 120.2];
    const r = readTimeRules(bars(closes), null);
    expect(r.halt?.at).toBe("top");
    expect(r.halt?.days).toBe(2);
    expect(r.halt!.stop).toBeGreaterThan(r.halt!.extreme);
  });

  it("places a reaction in its week and flags the 2-3 week zone and the third week", () => {
    const r = readTimeRules(bars(Array.from({ length: 30 }, () => 100)), { trend: "bullish", inCounterMove: true, days: 16, phase: "normal" });
    expect(r.reactionWeek).toBe(3);
    expect(r.reactionInZone).toBe(true);
    expect(r.thirdWeek).toBe(true);
    expect(r.reactionAbnormal).toBe(false);
  });
});

describe("double and triple tops", () => {
  // Three rallies to ~110 separated by dips, then a break above.
  const leg = (from: number, to: number, n: number) => Array.from({ length: n }, (_, i) => from + ((to - from) * (i + 1)) / n);
  const base = [...leg(100, 110, 6), ...leg(110, 102, 5), ...leg(102, 110, 6), ...leg(110, 102, 5), ...leg(102, 110, 6), ...leg(110, 103, 5)];

  it("reads a triple top that failed on its third test", () => {
    const r = readMultipleTops(bars(base));
    expect(r.top?.tests).toBeGreaterThanOrEqual(3);
    expect(r.top?.state).toBe("failed");
  });

  it("reads the crossing of a double or triple top", () => {
    const r = readMultipleTops(bars([...base, ...leg(103, 113, 6)]));
    expect(r.top?.state).toBe("crossed");
  });
});

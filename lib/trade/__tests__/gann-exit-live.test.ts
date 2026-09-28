import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { readGannExitFromBars } from "@/lib/trade/gann-exit-live";

function days(closes: number[], start = "2026-06-01"): Bar[] {
  const t0 = Date.parse(`${start}T00:00:00Z`);
  return closes.map((c, i) => ({
    t: new Date(t0 + i * 86_400_000).toISOString(),
    o: c,
    h: c + 1,
    l: c - 1,
    c,
    v: 1_000_000,
  }));
}

describe("readGannExitFromBars", () => {
  // Swings up and down, then a push higher after the entry day.
  const closes = [100, 103, 106, 103, 100, 97, 100, 104, 108, 104, 100, 98, 101, 105, 110, 112, 111, 113];
  const bars = days(closes);
  const entryDay = bars[14].t;

  it("skips the hold test when the entry never crossed the old top", () => {
    // An entry below the last swing top crossed nothing, so it can't fail to hold it.
    const r = readGannExitFromBars(
      { symbol: "TEST", side: "long", entryPrice: 95, initialStop: 89, openedAt: entryDay, best: 96 },
      bars.slice(0, 16),
      null,
    );
    expect(r.stop).toBe(89);
    expect(r.exit).toBeNull();
  });

  it("moves the stop to break-even after a gain equal to the risk", () => {
    const r = readGannExitFromBars(
      { symbol: "TEST", side: "long", entryPrice: 110, initialStop: 104, openedAt: entryDay, best: 117 },
      bars,
      null,
    );
    expect(r.stop).toBeGreaterThanOrEqual(110);
  });
});

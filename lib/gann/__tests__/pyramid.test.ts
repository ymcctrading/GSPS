import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { MAX_LOTS, readPyramidAdd } from "@/lib/gann/pyramid";

function days(closes: number[], start = "2026-06-01"): Bar[] {
  const t0 = Date.parse(`${start}T00:00:00Z`);
  return closes.map((c, i) => ({ t: new Date(t0 + i * 86_400_000).toISOString(), o: c, h: c + 0.5, l: c - 0.5, c, v: 1e6 }));
}

// A rise with a pullback after the first lot (day 3), leaving a swing top near 110.5.
const closes = [100, 101, 102, 104, 106, 108, 110, 109, 107, 105, 104, 106, 108, 111];
const daily = days(closes);

describe("readPyramidAdd", () => {
  const base = {
    side: "long" as const,
    lots: [{ qty: 100, price: 102, date: "2026-06-03" }],
    stop: 98,
    initialStop: 98,
    daily,
  };

  it("adds half the last lot at the crossed swing top and lifts the stop to break-even", () => {
    const r = readPyramidAdd({ ...base, price: 111 });
    expect(r.add).not.toBeNull();
    expect(r.add!.qty).toBe(50);
    expect(r.add!.trigger).toBeGreaterThan(110.5);
    expect(r.add!.newStop).toBeGreaterThan(102);
  });

  it("never adds to a position that hasn't earned a full risk unit", () => {
    expect(readPyramidAdd({ ...base, price: 105 }).add).toBeNull();
  });

  it("stops adding after the fourth lot", () => {
    const lots = Array.from({ length: MAX_LOTS }, (_, i) => ({ qty: 100 >> i, price: 102, date: "2026-06-03" }));
    expect(readPyramidAdd({ ...base, lots, price: 111 }).add).toBeNull();
  });
});

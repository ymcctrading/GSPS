/**
 * The narrow-week sale (W006 p.27, A-ENTRY-19): a narrow week followed by a
 * sharp drop on large volume turns the trend down; short even while the
 * averages rise. The sale rests 1 point under the narrow week's low, stop 3
 * points over it, on completed weeks.
 */
import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { computeGannHoldEntry } from "@/lib/gann/entryTrigger";
import { threePoints } from "@/lib/gann/pointScale";

const DAY = 86_400_000;
// Weekdays only, from Monday 2026-01-05.
function weekdays(weeks: { c: number[]; v?: number }[]): Bar[] {
  const out: Bar[] = [];
  const t0 = Date.parse("2026-01-05T05:00:00Z");
  weeks.forEach((w, k) =>
    w.c.forEach((c, d) => out.push({ t: new Date(t0 + (k * 7 + d) * DAY).toISOString(), o: c, h: c + 0.3, l: c - 0.3, c, v: w.v ?? 1e6 })),
  );
  return out;
}
const WIDE = Array.from({ length: 14 }, () => ({ c: [96, 104, 96, 104, 100] }));
const NARROW = { c: [100, 100.3, 99.8, 100.2, 100] };
const DROP = { c: [99, 97, 95, 93, 92], v: 3e6 };
const low = 99.8 - 0.3;

describe("the narrow-week sale (A-ENTRY-19)", () => {
  it("sells 1 point under the narrow week's low with the stop 3 points over it, with no bear market needed", () => {
    const bars = weekdays([...WIDE, NARROW, DROP]);
    const t = computeGannHoldEntry(bars, "bearish", [], undefined, false, false)!;
    expect(t).toMatchObject({ kind: "hold", holdBasis: "narrowWeek", direction: "bearish" });
    expect(t.level).toBeCloseTo(low, 8);
    expect(t.reactionEntry).toBeCloseTo(low - threePoints(low) / 3, 8);
    expect(t.reactionStop).toBeCloseTo(low + threePoints(low), 8);
  });

  it("waits for the drop week to close, and is not a buy", () => {
    const bars = weekdays([...WIDE, NARROW, DROP]);
    expect(computeGannHoldEntry(bars.slice(0, -1), "bearish", [], undefined, false, false)?.holdBasis).not.toBe("narrowWeek");
    expect(computeGannHoldEntry(bars, "bullish", [], undefined, false, false)?.holdBasis).not.toBe("narrowWeek");
  });

  it("needs the large volume and the 3-point drop", () => {
    expect(computeGannHoldEntry(weekdays([...WIDE, NARROW, { ...DROP, v: 1e6 }]), "bearish", [], undefined, false, false)?.holdBasis).not.toBe("narrowWeek");
    expect(computeGannHoldEntry(weekdays([...WIDE, NARROW, { c: [99.5, 99, 98, 97.5, 97], v: 3e6 }]), "bearish", [], undefined, false, false)?.holdBasis).not.toBe("narrowWeek");
  });

  it("is sold once: a bounce that reached the sell spends it", () => {
    const bars = weekdays([...WIDE, NARROW, DROP, { c: [94, 99.4, 96, 95, 94] }]);
    expect(computeGannHoldEntry(bars, "bearish", [], undefined, false, false)?.holdBasis).not.toBe("narrowWeek");
  });
});

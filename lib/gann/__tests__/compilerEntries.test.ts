/**
 * Two entry readings from a compiler of Gann's teaching (W003, class C), kept
 * as context and measured, never gating: the first return to the 50% point
 * after a break of it (C-ENTRY-04, W003 pp.20-21) and a narrow 3-4 day range
 * breaking into a sharp move (C-ENTRY-02, W003 p.17).
 */
import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { readHalfwayRetest } from "@/lib/gann/halfwayRetest";
import { NARROW_RANGE_ATR_FRACTION, readNarrowRangeBreak } from "@/lib/gann/narrowRange";
import { readDisclosedRules } from "@/lib/gann/disclosedRules";
import { contextFactorsFor } from "@/lib/gann/contextFactors";

const DAY = 86_400_000;
const leg = (from: number, to: number, n: number) => Array.from({ length: n }, (_, i) => from + ((to - from) * (i + 1)) / n);
function daily(closes: number[], half = 0.4): Bar[] {
  const t0 = Date.parse("2026-03-02T04:00:00Z");
  return closes.map((c, i) => ({ t: new Date(t0 + i * DAY).toISOString(), o: c, h: c + half, l: c - half, c, v: 1e6 }));
}

// An advance from 80 to 120 (50% at 100), a break under 100, and a rally back.
const ADVANCE = [...leg(90, 80, 5), ...leg(80, 120, 20)];
const broken = [...ADVANCE, ...leg(120, 95, 12)];

describe("the first return to the 50% point (C-ENTRY-04)", () => {
  it("is a short when a rally first comes back to the halfway point of the advance it broke", () => {
    const bars = daily([...broken, ...leg(95, 99.8, 4)]);
    const r = readHalfwayRetest(bars)!;
    expect(r.direction).toBe("bearish");
    expect(r.level).toBeCloseTo((79.6 + 120.4) / 2, 8);
    expect(r.state).toBe("returning");
  });

  it("waits while price is still under the 50% point after the break", () => {
    expect(readHalfwayRetest(daily(broken))).toMatchObject({ direction: "bearish", state: "broken" });
  });

  it("is no longer the first return after one has already reached it", () => {
    // Two returns to 100 with a dip between that turns no 3-day swing.
    const bars = daily([...broken, ...leg(95, 100, 3), 99.5, 99.0, 99.6, 100.1]);
    expect(readHalfwayRetest(bars)?.state).toBe("spent");
  });

  it("does not count the session that broke the point as a return to it", () => {
    // The break closes just under 100 with its high over it.
    const bars = daily([...ADVANCE, ...leg(120, 100.2, 8), 99.8, ...leg(99.8, 95, 4), ...leg(95, 99.8, 4)]);
    expect(readHalfwayRetest(bars)).toMatchObject({ direction: "bearish", state: "returning" });
  });

  it("is mirrored: a decline's halfway point broken upward, then the first reaction back, is a buy", () => {
    const DECLINE = [...leg(110, 120, 5), ...leg(120, 80, 20)];
    const bars = daily([...DECLINE, ...leg(80, 105, 12), ...leg(105, 100.2, 4)]);
    expect(readHalfwayRetest(bars)).toMatchObject({ direction: "bullish", state: "returning" });
  });

  it("is context: a factor on the trade in its direction, never a gate", () => {
    const bars = daily([...broken, ...leg(95, 99.8, 4)]);
    const ctx = readDisclosedRules(bars, bars.at(-1)!.c, null, new Date("2026-05-01T00:00:00Z"));
    expect(ctx.halfwayRetest?.state).toBe("returning");
    expect(contextFactorsFor(ctx, "bearish", bars.at(-1)!.c).halfwayReturnAgrees).toBe(true);
    expect(contextFactorsFor(ctx, "bullish", bars.at(-1)!.c).halfwayReturnAgrees).toBe(false);
  });
});

describe("a narrow range breaking into a sharp move (C-ENTRY-02)", () => {
  // Wide swings, then four days in a tight range, then a close out of it.
  const WIDE = Array.from({ length: 30 }, (_, i) => 100 + (i % 2 === 0 ? 3 : -3));

  it("flags four days narrower than the pre-registered fraction of the average day, and the break out of them", () => {
    expect(NARROW_RANGE_ATR_FRACTION).toBe(1);
    const bars = daily([...WIDE, 100, 100.2, 99.9, 100.1, 102.5], 0.3);
    const r = readNarrowRangeBreak(bars)!;
    expect(r).toMatchObject({ direction: "bullish", days: 4 });
    expect(r.rangeHigh).toBeCloseTo(100.5, 8);
    expect(r.rangeLow).toBeCloseTo(99.6, 8);
  });

  it("does not flag a range as wide as the days around it", () => {
    const bars = daily([...WIDE, 97, 103, 97, 103, 106], 0.3);
    expect(readNarrowRangeBreak(bars)).toBeNull();
  });

  it("measures the average day before the range, not across it", () => {
    // A 5.6-point range: narrower than the 6.6-point days before it, wider
    // than an average that takes in its own quieter days.
    const bars = daily([...WIDE, 100, 102.6, 97.6, 100, 103.5], 0.3);
    expect(readNarrowRangeBreak(bars)?.direction).toBe("bullish");
  });

  it("needs fifteen sessions before the range to know the average day", () => {
    expect(readNarrowRangeBreak(daily([...WIDE.slice(-15), 100, 100.2, 99.9, 100.1, 102.5], 0.3))).toMatchObject({ days: 4 });
    // Fourteen before the four days is fifteen before the last three of them.
    expect(readNarrowRangeBreak(daily([...WIDE.slice(-14), 100, 100.2, 99.9, 100.1, 102.5], 0.3))).toMatchObject({ days: 3 });
    expect(readNarrowRangeBreak(daily([...WIDE.slice(-13), 100, 100.2, 99.9, 100.1, 102.5], 0.3))).toBeNull();
  });

  it("reads a narrow three-day range beside a wide fourth day (batch review C1)", () => {
    const bars = daily([...WIDE, 106, 100, 100.2, 99.9, 102.5], 0.3);
    expect(readNarrowRangeBreak(bars)).toMatchObject({ direction: "bullish", days: 3 });
  });

  it("does not flag a narrow range until a close leaves it", () => {
    expect(readNarrowRangeBreak(daily([...WIDE, 100, 100.2, 99.9, 100.1, 100.2], 0.3))).toBeNull();
  });

  it("is mirrored for a break down, and is a factor on the trade in its direction", () => {
    const bars = daily([...WIDE, 100, 100.2, 99.9, 100.1, 97.4], 0.3);
    expect(readNarrowRangeBreak(bars)?.direction).toBe("bearish");
    const ctx = readDisclosedRules(bars, bars.at(-1)!.c, null, new Date("2026-05-01T00:00:00Z"));
    expect(contextFactorsFor(ctx, "bearish", bars.at(-1)!.c).narrowRangeBreakAgrees).toBe(true);
    expect(contextFactorsFor(ctx, "bullish", bars.at(-1)!.c).narrowRangeBreakAgrees).toBe(false);
  });
});

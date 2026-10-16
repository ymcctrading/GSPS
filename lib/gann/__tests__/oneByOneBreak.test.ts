/**
 * C-STOP-02 (class C, Additional Cycle Findings p. 20): a close through the
 * 1x1 from a fan anchor points to the next angle, the 1x2. Shown as the next
 * level; it is not a stop or a target.
 */
import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { computeFanLines, readOneByOneBreak } from "@/lib/gann/fans";
import { describeDisclosedRules, readDisclosedRules } from "@/lib/gann/disclosedRules";
import { contextFactorsFor } from "@/lib/gann/contextFactors";

function series(closes: number[]): Bar[] {
  return closes.map((c, i) => ({ t: new Date(Date.UTC(2026, 0, 5 + i)).toISOString(), o: c, h: c + 0.2, l: c - 0.2, c, v: 1e6 }));
}
const down = Array.from({ length: 20 }, (_, i) => 50 - i * 0.5 + (i % 2 === 0 ? 0.3 : 0)); // to about 40.5
const up = Array.from({ length: 8 }, (_, i) => 40 + (i + 1) * 2); // 2 points a bar, over the 1x1
const flat = (n: number) => Array.from({ length: n }, () => 56);
const base = [...down, 40, ...up];

describe("a break of the 1x1 (C-STOP-02)", () => {
  it("points to the 1x2 from the same low once a close goes under the 1x1", () => {
    const bars = series([...base, ...flat(14)]);
    const price = bars[bars.length - 1].c;
    const lines = computeFanLines(bars, price);
    const oneByOne = lines.find((l) => l.angle === "1x1 (low)")!;
    const oneByTwo = lines.find((l) => l.angle === "1x2 (low)")!;
    expect(price).toBeLessThan(oneByOne.price);
    expect(price).toBeGreaterThan(oneByTwo.price);
    const r = readOneByOneBreak(bars).find((b) => b.anchor.kind === "low")!;
    expect(r.direction).toBe("down");
    expect(r.oneByOne).toBeCloseTo(oneByOne.price);
    expect(r.next.angle).toBe("1x2");
    expect(r.next.price).toBeCloseTo(oneByTwo.price);
  });

  it("is none while price still holds the 1x1", () => {
    const bars = series([...base, ...flat(2)]);
    expect(readOneByOneBreak(bars).find((b) => b.anchor.kind === "low")).toBeUndefined();
  });

  it("is none when no close since the low ever held the 1x1", () => {
    // A slow rise from the low: every close sits under the 1x1 and over the 1x2.
    const bars = series([...down, 40, ...Array.from({ length: 16 }, (_, i) => 40 + (i + 1) * 0.75)]);
    const price = bars[bars.length - 1].c;
    const lines = computeFanLines(bars, price);
    const unit = (lines.find((l) => l.angle === "1x1 (low)")!.price - 40) / 16;
    expect(bars.slice(21).every((b, i) => b.c < 40 + unit * (i + 1))).toBe(true);
    expect(price).toBeGreaterThan(lines.find((l) => l.angle === "1x2 (low)")!.price);
    expect(readOneByOneBreak(bars)).toEqual([]);
  });

  it("is none once price is under the 1x2 too", () => {
    const bars = series([...base, ...flat(10), ...Array.from({ length: 6 }, (_, i) => 50 - i * 2)]);
    const price = bars[bars.length - 1].c;
    const oneByTwo = computeFanLines(bars, price).find((l) => l.angle === "1x2 (low)")!;
    expect(price).toBeLessThan(oneByTwo.price);
    expect(readOneByOneBreak(bars).find((b) => b.anchor.kind === "low")).toBeUndefined();
  });

  it("reaches the setup as the next level and a measured factor", () => {
    const bars = series([...base, ...flat(14)]);
    const ctx = readDisclosedRules(bars, 56, null, new Date(bars[bars.length - 1].t));
    expect(ctx.oneByOneBreak?.some((b) => b.direction === "down")).toBe(true);
    expect(describeDisclosedRules(ctx).some((l) => /closed under the 1x1/.test(l) && /next angle/.test(l) && /not a stop or a target/.test(l))).toBe(true);
    expect(contextFactorsFor(ctx, "bearish", 56).oneByOneBreakWithTrade).toBe(true);
    expect(contextFactorsFor(ctx, "bullish", 56).oneByOneBreakWithTrade).toBe(false);
  });
});

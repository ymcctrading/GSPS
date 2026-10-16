/**
 * C-LEVELS-24 (class C, Jensen 1978, printed pp. 111-113): lines of 90, 45
 * and 22½ points per square drawn from the tests of a double or triple
 * bottom converge on a major point. Context only.
 */
import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { describeJensenConvergence, jensenBottomConvergence, jensenPointAngle } from "@/lib/gann/jensen";
import { gannPointForBars } from "@/lib/gann/pointScale";
import { readMultipleTops } from "@/lib/gann/multipleTops";
import { describeDisclosedRules, readDisclosedRules } from "@/lib/gann/disclosedRules";
import { contextFactorsFor } from "@/lib/gann/contextFactors";

const DAY = 86_400_000;
function series(closes: number[]): Bar[] {
  return closes.map((c, i) => ({ t: new Date(Date.UTC(2026, 0, 5) + i * DAY).toISOString(), o: c, h: c + 0.2, l: c - 0.2, c, v: 1e6 }));
}
const leg = (from: number, to: number, n: number) => Array.from({ length: n }, (_, i) => from + ((to - from) * (i + 1)) / n);
// Down to 40, up to 48, back to 40 (a double bottom), then up.
const closes = [60, ...leg(60, 40, 10), ...leg(40, 48, 8), ...leg(48, 40.1, 8), ...leg(40.1, 46, 6)];

describe("lines from a double bottom converge (C-LEVELS-24)", () => {
  const bars = series(closes);
  const unit = gannPointForBars(bars);

  it("starts from the two tests of the double bottom", () => {
    expect(readMultipleTops(bars).bottom?.tests).toBe(2);
    const r = jensenBottomConvergence(bars, unit)!;
    expect(r.kind).toBe("bottom");
    expect(r.tests.map((t) => t.index)).toEqual([10, 26]);
  });

  it("returns the point where lines from different tests meet, with each line's exact angle", () => {
    const r = jensenBottomConvergence(bars, unit)!;
    const [a, b] = r.tests;
    expect(r.point.lines.length).toBeGreaterThanOrEqual(2);
    expect(new Set(r.point.lines.map((l) => l.testIndex)).size).toBeGreaterThanOrEqual(2);
    for (const l of r.point.lines) {
      expect([90, 45, 22.5]).toContain(l.points);
      expect(l.angle).toBeCloseTo(jensenPointAngle(l.points), 10);
      const t = l.testIndex === a.index ? a : b;
      const at = t.price + (l.points / 90) * unit * (r.point.index - t.index);
      expect(Math.abs(at - r.point.price)).toBeLessThanOrEqual(unit);
    }
    expect(r.point.index).toBeGreaterThan(b.index);
    expect(r.point.barsFromNow).toBe(r.point.index - (bars.length - 1));
  });

  it("is none without a double or triple bottom", () => {
    expect(jensenBottomConvergence(series([...leg(50, 40, 10), ...leg(40, 60, 20)]), unit)).toBeNull();
  });

  it("reaches the setup and the factor table", () => {
    const r = jensenBottomConvergence(bars, unit)!;
    // Read on the session the convergence falls on.
    const extra = Array.from({ length: Math.max(0, r.point.barsFromNow) }, () => 46);
    const at = series([...closes, ...extra]);
    const ctx = readDisclosedRules(at, 46, null, new Date(at[at.length - 1].t));
    expect(ctx.jensenConvergence?.point.index).toBe(r.point.index);
    expect(Math.abs(ctx.jensenConvergence!.point.barsFromNow)).toBeLessThanOrEqual(1);
    expect(describeDisclosedRules(ctx).some((l) => /double bottom/.test(l) && /converge/.test(l) && /Shown for context/.test(l))).toBe(true);
    expect(contextFactorsFor(ctx, "bullish", 46).jensenConvergenceNow).toBe(true);
  });

  it("does not read a convergence two or more sessions away as now", () => {
    const early = series(closes.slice(0, closes.length - 3));
    const ctx = readDisclosedRules(early, early[early.length - 1].c, null, new Date(early[early.length - 1].t));
    expect(ctx.jensenConvergence!.point.barsFromNow).toBeGreaterThanOrEqual(2);
    expect(contextFactorsFor(ctx, "bullish", early[early.length - 1].c).jensenConvergenceNow).toBe(false);
  });
});

describe("lines from a triple bottom converge (C-LEVELS-24)", () => {
  // Bottoms at bars 10, 26 and 34; the third is a little higher, so the third
  // line passes the crossing of the other two within one point, not exactly.
  const tri = [60, ...leg(60, 40, 10), ...leg(40, 48, 8), ...leg(48, 40, 8), ...leg(40, 44, 4), ...leg(44, 40.3, 4), ...leg(40.3, 46, 10)];
  const bars = series(tri);
  const unit = gannPointForBars(bars);

  it("finds the point three lines pass, one from each test", () => {
    const r = jensenBottomConvergence(bars, unit)!;
    expect(r.tests.map((t) => t.index)).toEqual([10, 26, 34]);
    expect(r.point.index).toBe(41);
    expect(r.point.lines.map((l) => [l.testIndex, l.points])).toEqual([
      [10, 22.5],
      [26, 45],
      [34, 90],
    ]);
    expect(describeJensenConvergence(r)).toMatch(/triple bottom/);
  });
});

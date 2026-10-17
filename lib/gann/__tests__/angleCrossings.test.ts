import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { angleRank, computeFanLines } from "../fans";
import {
  multipleTestCrossing,
  readAngleCrossings,
  squareOfRangeCrossings,
  zeroAngle,
} from "../angleCrossings";
import { contextFactorsFor } from "../contextFactors";
import { describeDisclosedRules, readDisclosedRules } from "../disclosedRules";

function bar(i: number, c: number, spread = 1): Bar {
  const t = new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString();
  return { t, o: c, h: c + spread, l: c - spread, c, v: 1_000_000 };
}

/** A zig-zag with real reversals, so the swing charts complete swings. */
function zigzag(n: number, base = 40, amp = 6, period = 12): Bar[] {
  return Array.from({ length: n }, (_, i) => {
    const phase = (i % period) / period;
    const tri = phase < 0.5 ? phase * 2 : 2 - phase * 2;
    return bar(i, base + amp * tri + i * 0.05);
  });
}

describe("C-LEVELS-04: angles from zero (Master Course Ch.4 PDF 132-135, Form #7)", () => {
  it("from a 20 low, the 45 degree from zero reaches 20 in 20 periods", () => {
    const z = zeroAngle({ index: 10, price: 20 }, 1, 30, 1);
    expect(z.lineNow).toBe(20);
    expect(z.balanceIndex).toBe(30);
    expect(z.barsToBalance).toBe(0);
  });

  it("the 45 degree down from a top reaches zero after as many periods as the top has points", () => {
    const z = zeroAngle({ index: 0, price: 109 }, 1, 9, -1);
    expect(z.lineNow).toBe(100);
    expect(z.balanceIndex).toBe(109);
    expect(z.barsToBalance).toBe(100);
  });
});

describe("C-LEVELS-05: angles from each bottom of a double or triple bottom cross (Master Course Ch.4 PDF 132, Form #6)", () => {
  it("crosses the 45 degree from the first bottom with the 2x1 from the second", () => {
    // 1B at 40 on bar 0, 2B at 41 on bar 10, one point a bar: the 1x1 from 1B
    // and the 2x1 from 2B meet at bar 19, price 59.
    const x = multipleTestCrossing({ index: 0, price: 40 }, { index: 10, price: 41 }, 1, 1);
    expect(x).not.toBeNull();
    expect(x!.index).toBeCloseTo(19);
    expect(x!.price).toBeCloseTo(59);
  });

  it("mirrors for a double top, with the angles falling", () => {
    const x = multipleTestCrossing({ index: 0, price: 60 }, { index: 10, price: 59 }, 1, -1);
    expect(x!.index).toBeCloseTo(19);
    expect(x!.price).toBeCloseTo(41);
  });
});

describe("C-LEVELS-09: the 1x1 ranks first, and the square of a range has its crossings (Master Course Ch.4 PDF 125, Ch.13 PDF 377-379, Ch.16 PDF 428)", () => {
  it("ranks the 1x1 first and alone, then the 2x1s, then the 4x1s", () => {
    expect(angleRank("1x1")).toBe(1);
    expect(angleRank("2x1")).toBe(2);
    expect(angleRank("1x2")).toBe(2);
    expect(angleRank("4x1")).toBe(3);
    expect(angleRank("1x8")).toBeGreaterThan(3);
  });

  it("puts the rank on every fan line", () => {
    const lines = computeFanLines(zigzag(80), 45);
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) expect(l.rank).toBe(angleRank(l.angle.split(" ")[0]));
  });

  it("crosses the corner angles at the centre and the midpoint angles at the quarters", () => {
    // Range 40 to 60 from bar 0, one point a bar: the square closes at bar 20.
    const s = squareOfRangeCrossings({ index: 0, price: 40 }, { index: 5, price: 60 }, 1, 10);
    expect(s.endIndex).toBe(20);
    const at = (i: number) => s.crossings.filter((c) => c.index === i).map((c) => c.price).sort((a, b) => a - b);
    expect(at(10)).toEqual([50]);
    expect(at(5)).toEqual([45, 55]);
    // At bar 10 the corner angles sit at 50; price there is on them.
    expect(s.onAngle(50)).toBe(true);
    expect(s.onAngle(55)).toBe(false);
  });
});

describe("angle crossings reach the live scan and the replay alike", () => {
  it("is read by readDisclosedRules, described, and turned into factors", () => {
    const bars = zigzag(120);
    const price = bars[bars.length - 1].c;
    const r = readAngleCrossings(bars, price);
    const ctx = readDisclosedRules(bars, price, null, new Date(bars[bars.length - 1].t));
    expect(ctx.angleCrossings).toEqual(r);
    expect(r.fromZero.bottom).not.toBeNull();
    const f = contextFactorsFor(ctx, "bullish", price);
    expect(typeof f.onZeroAngle).toBe("boolean");
    expect(typeof f.onSquareOfRangeAngle).toBe("boolean");
    expect(typeof f.nearestAngleIsOneByOne).toBe("boolean");
    const lines = describeDisclosedRules(ctx).join("\n");
    expect(lines).toMatch(/from zero/);
    // No source name in a line a person reads.
    expect(lines.toLowerCase()).not.toContain(["g", "ann"].join(""));
  });
});

describe("readAngleCrossings on real swings (review of #328)", () => {
  it("C-LEVELS-05: reads every test of the double or triple bottom, and their crossings", () => {
    const bars = zigzag(80);
    const m = readAngleCrossings(bars, bars[bars.length - 1].c).multipleTests;
    expect(m?.kind).toBe("bottom");
    expect(m!.tests).toBeGreaterThanOrEqual(2);
    expect(m!.crossings.length).toBe((m!.tests * (m!.tests - 1)) / 2);
  });

  it("C-LEVELS-09: closes the square when time has run as many bars as the range has points", () => {
    const flat = (n: number) => Array.from({ length: n }, (_, i) => {
      const ph = (i % 12) / 12;
      return bar(i, 40 + 10 * (ph < 0.5 ? ph * 2 : 2 - ph * 2));
    });
    let closed = 0;
    for (let n = 40; n <= 100; n++) {
      const b = flat(n);
      const sq = readAngleCrossings(b, b[n - 1].c).square!;
      expect(sq.atEnd, `n=${n}`).toBe(Math.abs(sq.endIndex - (n - 1)) <= 1);
      if (sq.atEnd) closed++;
    }
    expect(closed).toBeGreaterThan(0);
    const at60 = flat(60);
    expect(readAngleCrossings(at60, at60[59].c).square?.atEnd).toBe(true);
  });
});

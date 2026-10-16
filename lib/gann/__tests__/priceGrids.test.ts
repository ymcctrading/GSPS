import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { nineTwelveGrid, paritySquares, range144, readPriceGrids } from "../priceGrids";
import { contextFactorsFor } from "../contextFactors";
import { describeDisclosedRules, readDisclosedRules } from "../disclosedRules";

describe("C-NUMEROLOGY-01: odd lows work to odd squares, even lows to even squares (Master Course Ch.6 PDF 209-210)", () => {
  it("takes the squares of the low's parity either side of the price", () => {
    // Low 25 (odd): odd squares 49 and 81 bracket 60.
    const s = paritySquares(25, 60);
    expect(s.parity).toBe("odd");
    expect(s.squareBelow).toBe(49);
    expect(s.squareAbove).toBe(81);
    // Low 24 (even): even squares 36 and 64.
    const e = paritySquares(24, 60);
    expect(e.parity).toBe("even");
    expect([e.squareBelow, e.squareAbove]).toEqual([36, 64]);
  });

  it("gives the half-way points between successive squares (6½, 12½ … 132½)", () => {
    expect(paritySquares(1, 6).halfwayAbove).toBe(6.5);
    expect(paritySquares(1, 130).halfwayAbove).toBe(132.5);
    expect(paritySquares(1, 130).halfwayBelow).toBe(110.5);
  });
});

describe("C-TIME-15: levels of 9 and 12 and their halves (Master Course Ch.6 PDF 186)", () => {
  it("brackets the price with the 9 grid and the 12 grid", () => {
    const g = nineTwelveGrid(50);
    expect([g.nineBelow, g.nineAbove]).toEqual([49.5, 54]);
    expect([g.twelveBelow, g.twelveAbove]).toEqual([48, 54]);
  });

  it("does not stop at 144", () => {
    expect(nineTwelveGrid(145).nineAbove).toBe(148.5);
  });
});

describe("C-TIME-16 / C-NUMEROLOGY-03: a range near a multiple of 144 (Master Course Ch.13 PDF 375, 378)", () => {
  it("watches near 288 for a range of 281, the wheat example", () => {
    const r = range144(28, 309);
    expect(r.rangePoints).toBe(281);
    expect(r.nextMultiple).toBe(2);
    expect(r.price).toBe(28 + 288);
    expect(r.approaching).toBe(true);
  });

  it("is not approaching more than one 9-division short of the multiple", () => {
    expect(range144(0, 270).approaching).toBe(false);
  });
});

function daily(closes: number[]): Bar[] {
  return closes.map((c, i) => ({
    t: new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString(),
    o: c,
    h: c + 0.5,
    l: c - 0.5,
    c,
    v: 1000,
  }));
}

describe("price grids in points, on the card and in the factor table", () => {
  it("reads the grids in price-scaled points and converts back to dollars", () => {
    const bars = daily(Array.from({ length: 60 }, (_, i) => 40 + (i % 10)));
    const g = readPriceGrids(bars, 45, 1)!;
    expect(g.unit).toBe(1);
    expect(g.paritySquares.squareAbove).toBeGreaterThan(45);
    expect(g.nineTwelve.nineBelow).toBeLessThanOrEqual(45);
    const scaled = readPriceGrids(bars, 45, 2)!;
    expect(scaled.nineTwelve.nineAbove % 9).toBe(0);
  });

  it("is wired into the disclosed rules and the factor table", () => {
    const bars = daily(Array.from({ length: 60 }, (_, i) => 40 + (i % 10)));
    const ctx = readDisclosedRules(bars, 45, null, new Date("2026-03-01T21:00:00Z"));
    expect(ctx.priceGrids).toBeTruthy();
    const f = contextFactorsFor(ctx, "bullish", 45);
    expect(typeof f.nearParitySquare).toBe("boolean");
    expect(typeof f.nearSquareHalfway).toBe("boolean");
    expect(typeof f.nearNineTwelveLevel).toBe("boolean");
    expect(typeof f.rangeApproachingMultipleOf144).toBe("boolean");
    expect(describeDisclosedRules(ctx).some((l) => l.includes("squares"))).toBe(true);
  });
});

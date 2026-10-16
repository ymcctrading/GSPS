import { describe, expect, it } from "vitest";
import {
  GREAT_CYCLE,
  GREAT_CYCLE_FRACTIONS_DAYS,
  STRONGEST_POINTS,
  daysToPassSquareOfHours,
  positionInSquare,
  pricePositions,
  readMasterCalculator,
  squareBoundaryLevels,
} from "../masterCalculator";

// Every number below is Gann's own, from the 1953 lesson and the May soy
// beans instructions (source note A12). Unit = 1 reproduces his literal points.

describe("position in the square of 144", () => {
  it("reads 436¾ as 4¾ in the fourth square", () => {
    const p = positionInSquare(436.75);
    expect(p.square).toBe(4);
    expect(p.position).toBeCloseTo(4.75, 6);
  });

  it("reads the 369¾ range (436¾ − 67) as 81¾ in the third square", () => {
    const p = positionInSquare(436.75 - 67);
    expect(p.square).toBe(3);
    expect(p.position).toBeCloseTo(81.75, 6);
  });

  it("reads the 235½ decline as 91½ in the second square, on the strong 90 (5/8)", () => {
    const p = positionInSquare(436.75 - 201.25);
    expect(p.square).toBe(2);
    expect(p.position).toBeCloseTo(91.5, 6);
    expect(p.onStrongPoint).toBe(true);
    expect(p.nearest.point).toBe(90);
  });

  it("reads the 143½ advance as just inside the first square, at its top", () => {
    const p = positionInSquare(143.5);
    expect(p.square).toBe(1);
    expect(p.nearest.point).toBe(144);
    expect(p.onStrongPoint).toBe(true);
  });

  it("puts wheat's 286 within two points of the end of the second square, and 281 short of it", () => {
    expect(positionInSquare(286).onStrongPoint).toBe(true);
    expect(positionInSquare(281).onStrongPoint).toBe(false);
  });

  it("lists the strongest points as ¼, ⅓, ⅜, ½, ⅝, ⅔, ¾, ⅞ and the full square", () => {
    expect(STRONGEST_POINTS.map((s) => s.point)).toEqual([36, 48, 54, 72, 90, 96, 108, 126, 144]);
    // 27 is 3/16 of 144 (the text misprints "3/8"); ⅜ is 54.
    expect(STRONGEST_POINTS.find((s) => s.fraction === "3/8")?.point).toBe(54);
  });
});

describe("the Great Cycle and hourly counts", () => {
  it("halves 20,736 days down to 81 = 9 × 9", () => {
    expect(GREAT_CYCLE).toBe(20736);
    expect(GREAT_CYCLE_FRACTIONS_DAYS.map((f) => f.days)).toEqual([20736, 10368, 5184, 2592, 1296, 648, 324, 162, 81]);
  });

  it("passes 144 hours in 6 days at 24 hours a day and 28 days 4 hours at 5", () => {
    expect(daysToPassSquareOfHours(24)).toBe(6);
    expect(daysToPassSquareOfHours(5)).toBeCloseTo(28.8, 6);
    expect(GREAT_CYCLE / 24).toBe(864);
  });

  it("gives 46 weeks 2 days for 1/64 (the text misprints 41)", () => {
    const d = GREAT_CYCLE / 64;
    expect(Math.floor(d / 7)).toBe(46);
    expect(d % 7).toBe(2);
  });
});

describe("placements", () => {
  it("puts the centre, 72, on the half-way point", () => {
    const p = pricePositions(240.375, 44, 436.75, 1);
    expect(p.halfRange.position).toBeCloseTo(72, 6);
    const q = pricePositions(218.375, 44, 436.75, 1);
    expect(q.halfHigh.position).toBeCloseTo(72, 6);
  });

  it("lists square ends and centres from 0, up from the low and down from the high", () => {
    const levels = squareBoundaryLevels(100, 50, 150, 1, 0.5).map((l) => l.price);
    expect(levels).toEqual([72, 78, 122, 144]);
  });
});

function monthly(n: number, low: number, lowAt: number, high: number, highAt: number) {
  const bars = [];
  for (let i = 0; i < n; i++) {
    const t = new Date(Date.UTC(1900, i, 1)).toISOString();
    const mid = (low + high) / 2;
    bars.push({ t, h: i === highAt ? high : mid + 1, l: i === lowAt ? low : mid - 1 });
  }
  return bars;
}

describe("squaring price with time (the wheat example)", () => {
  it("finds the 281-month square of the range 44 to 325", () => {
    const bars = monthly(282, 44, 0, 325, 100);
    const r = readMasterCalculator(bars, 200, 1)!;
    expect(r.fromLow!.squaringPrice.some((s) => s.of === "range" && s.unit === "months")).toBe(true);
  });

  it("finds 6½ × 44 = 286 months from the low", () => {
    const bars = monthly(287, 44, 0, 325, 100);
    const r = readMasterCalculator(bars, 200, 1)!;
    const hit = r.fromLow!.squaringPrice.find((s) => s.of === "low price" && s.unit === "months");
    expect(hit?.multiple).toBe(6.5);
  });

  it("reads time and price square when both sit at the same place in the square", () => {
    // Low 100 on day 0, price 136 (36 points up) 36 days later.
    const bars = [];
    for (let i = 0; i <= 36; i++) {
      const t = new Date(Date.UTC(2020, 0, 1 + i)).toISOString();
      bars.push({ t, h: i === 20 ? 140 : 120, l: i === 0 ? 100 : 110 });
    }
    const r = readMasterCalculator(bars, 136, 1)!;
    expect(r.fromLow!.timePriceSquare.some((s) => s.unit === "days")).toBe(true);
    expect(r.fromLow!.onChangePoint.some((h) => h.unit === "days" && h.point === 36)).toBe(true);
  });
});

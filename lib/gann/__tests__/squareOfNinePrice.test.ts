import { describe, expect, it } from "vitest";
import { nearestCrossNumbers, squareOfNinePriceLevels } from "../squareOfNinePrice";
import { numbersOnLine } from "../squareOfNineTime";
import { pricePoint } from "../pointScale";
import { gannMasterLevels } from "../masterLevels";
import type { Bar } from "@/lib/types";

describe("the nine square read in price", () => {
  it("puts the listed diagonals on the crosses (Master Course Ch. 2, 73 as corrected in Ch. 15A)", () => {
    expect(numbersOnLine(45, 100)).toEqual([3, 13, 31, 57, 91]);
    expect(numbersOnLine(225, 120)).toEqual([7, 21, 43, 73, 111]);
    expect(numbersOnLine(270, 80)).toEqual([8, 23, 46, 77]);
    expect(numbersOnLine(90, 70)).toEqual([4, 15, 34, 61]);
  });

  it("reads 73 on the 225° line and 91 on the 45° line, fixed cross", () => {
    // 73 is the cell, so it is the support at 73; the next cross number is the resistance.
    const at73 = nearestCrossNumbers(73);
    expect(at73.below).toEqual({ number: 73, angle: 225, kind: "fixed" });
    expect(at73.above!.number).toBe(77); // 270°, cardinal
    expect(at73.above!.kind).toBe("cardinal");
    const at90 = nearestCrossNumbers(90);
    expect(at90.above).toEqual({ number: 91, angle: 45, kind: "fixed" });
    expect(at90.below!.number).toBe(86); // 0°, cardinal: 81 − (7 − 0)·4 + … = 9² + 5 = 86
  });

  it("leaves the 22.5° lines out and skips numbers below 10", () => {
    // Ring 2's 22.5° line carries 12 (between 11 at 0° and 13 at 45°).
    const n = nearestCrossNumbers(12);
    expect(n.below!.number).toBe(11);
    expect(n.above!.number).toBe(13);
    expect(nearestCrossNumbers(5).below).toBeNull();
    expect(nearestCrossNumbers(5).above!.number).toBe(11);
  });

  it("brackets the price with consecutive cross numbers across rings", () => {
    for (const pts of [11.5, 24.9, 25, 48.2, 120, 333.3, 1000]) {
      const { below, above } = nearestCrossNumbers(pts);
      expect(below!.number).toBeLessThanOrEqual(pts);
      expect(above!.number).toBeGreaterThan(pts);
      // No cross number lies strictly between them.
      for (const a of [0, 45, 90, 135, 180, 225, 270, 315]) {
        for (const x of numbersOnLine(a, 2000)) expect(x > below!.number && x < above!.number).toBe(false);
      }
    }
  });

  it("converts the cell numbers to dollars in points at a low and a high price", () => {
    for (const price of [20, 500]) {
      const unit = pricePoint(price);
      const levels = squareOfNinePriceLevels(price, unit);
      expect(levels).toHaveLength(2);
      const [support, resistance] = levels;
      expect(support.role).toBe("support");
      expect(resistance.role).toBe("resistance");
      expect(support.price).toBeCloseTo(support.number * unit, 9);
      expect(resistance.price).toBeCloseTo(resistance.number * unit, 9);
      expect(support.price).toBeLessThanOrEqual(price);
      expect(resistance.price).toBeGreaterThan(price);
      expect(support.label).toContain(`Nine-square cross number ${support.number}`);
      expect(resistance.label).toMatch(/resistance$/);
    }
    // $20 is about 31.2 points (3 points ≈ 9.6% of price): support on 31, the 45° line.
    const low = squareOfNinePriceLevels(20, pricePoint(20));
    expect(low[0].number).toBe(31);
    expect(low[0].angle).toBe(45);
    // $500 is about 116.3 points (3 points ≈ 2.6%): support on 116, the 270° line
    // (Gann's 8, 23, 46, 77, 116 …), resistance on 121 (11², the 315° line).
    const high = squareOfNinePriceLevels(500, pricePoint(500));
    expect(high[0].number).toBe(116);
    expect(high[0].kind).toBe("cardinal");
    expect(high[1].number).toBe(121);
  });

  it("returns nothing for a bad price or unit", () => {
    expect(squareOfNinePriceLevels(0, 1)).toEqual([]);
    expect(squareOfNinePriceLevels(50, 0)).toEqual([]);
  });

  it("reaches the S/R list through gannMasterLevels, the function the live scan and the replay both call", () => {
    const daily: Bar[] = Array.from({ length: 60 }, (_, i) => {
      const c = 50 + 5 * Math.sin(i / 4);
      return { t: new Date(Date.UTC(2026, 0, 2 + i)).toISOString(), o: c, h: c + 1, l: c - 1, c, v: 1e6 };
    });
    const sq9 = gannMasterLevels(daily, daily, 52, new Date("2026-06-01T12:00:00Z")).filter((l) => l.source === "squareOfNine");
    expect(sq9).toHaveLength(2);
    expect(sq9[0].price).toBeLessThanOrEqual(52);
    expect(sq9[1].price).toBeGreaterThan(52);
  });
});

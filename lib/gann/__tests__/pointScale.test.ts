import { describe, expect, it } from "vitest";
import { threePoints, threePointsPct, MAX_ALLOWANCE_PCT, MIN_ALLOWANCE_PCT } from "@/lib/gann/pointScale";

describe("threePoints", () => {
  it("gives 3 points in the middle of the $25-60 band and 7.5 in the middle of $100-300", () => {
    expect(threePoints(42.5)).toBeCloseTo(3, 6);
    expect(threePoints(200)).toBeCloseTo(7.5, 6);
  });

  it("shrinks as a share of price as the price rises, within the clamp", () => {
    const pcts = [5, 25, 60, 100, 300, 1000, 10000].map(threePointsPct);
    for (let i = 1; i < pcts.length; i++) expect(pcts[i]).toBeLessThanOrEqual(pcts[i - 1]);
    expect(Math.max(...pcts)).toBe(MAX_ALLOWANCE_PCT);
    expect(Math.min(...pcts)).toBe(MIN_ALLOWANCE_PCT);
  });

  it("is zero for a non-positive price", () => {
    expect(threePoints(0)).toBe(0);
  });
});

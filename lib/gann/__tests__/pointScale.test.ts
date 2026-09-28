import { describe, expect, it } from "vitest";
import { gannThreePoints, gannThreePointsPct, MAX_ALLOWANCE_PCT, MIN_ALLOWANCE_PCT } from "@/lib/gann/pointScale";

describe("gannThreePoints", () => {
  it("gives 3 points in the middle of the $25-60 band and 7.5 in the middle of $100-300", () => {
    expect(gannThreePoints(42.5)).toBeCloseTo(3, 6);
    expect(gannThreePoints(200)).toBeCloseTo(7.5, 6);
  });

  it("shrinks as a share of price as the price rises, within the clamp", () => {
    const pcts = [5, 25, 60, 100, 300, 1000, 10000].map(gannThreePointsPct);
    for (let i = 1; i < pcts.length; i++) expect(pcts[i]).toBeLessThanOrEqual(pcts[i - 1]);
    expect(Math.max(...pcts)).toBe(MAX_ALLOWANCE_PCT);
    expect(Math.min(...pcts)).toBe(MIN_ALLOWANCE_PCT);
  });

  it("is zero for a non-positive price", () => {
    expect(gannThreePoints(0)).toBe(0);
  });
});

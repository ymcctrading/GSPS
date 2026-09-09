import { describe, expect, it } from "vitest";
import { nearestGannAngle, normalizedSlope } from "../normalizedSlope";

describe("normalizedSlope", () => {
  it("computes (price_t - anchor_price) / (atr_at_anchor * bars_since_anchor)", () => {
    // Price rose 10 over 5 bars, ATR at anchor was 2 -> 10 / (2 * 5) = 1 (a 1x1 slope).
    expect(normalizedSlope(110, 100, 2, 5)).toBe(1);
  });

  it("is negative for a decline off the anchor", () => {
    expect(normalizedSlope(90, 100, 2, 5)).toBe(-1);
  });

  it("returns null rather than dividing by zero when ATR or bars-since-anchor is non-positive", () => {
    expect(normalizedSlope(110, 100, 0, 5)).toBeNull();
    expect(normalizedSlope(110, 100, 2, 0)).toBeNull();
    expect(normalizedSlope(110, 100, -1, 5)).toBeNull();
  });

  it("returns null for non-finite price inputs", () => {
    expect(normalizedSlope(NaN, 100, 2, 5)).toBeNull();
    expect(normalizedSlope(110, Infinity, 2, 5)).toBeNull();
  });
});

describe("nearestGannAngle", () => {
  it("picks the closest fixed ratio and reports direction", () => {
    expect(nearestGannAngle(1)).toEqual({ label: "1x1", ratio: 1, direction: "up" });
    expect(nearestGannAngle(-1)).toEqual({ label: "1x1", ratio: 1, direction: "down" });
    expect(nearestGannAngle(0.26)).toEqual({ label: "1x4", ratio: 0.25, direction: "up" });
    expect(nearestGannAngle(3.9)).toEqual({ label: "4x1", ratio: 4, direction: "up" });
  });

  it("returns null for a non-finite slope", () => {
    expect(nearestGannAngle(NaN)).toBeNull();
  });
});

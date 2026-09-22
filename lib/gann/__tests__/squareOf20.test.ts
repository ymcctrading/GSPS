import { describe, expect, it } from "vitest";
import {
  TOTAL_CELLS,
  NYSE_FOUNDING,
  COLUMBUS_LANDING,
  WORKED_EXAMPLES,
  yearsElapsed,
  ringAndAngleOf,
  dateToGridCell,
} from "../squareOf20";

describe("grid constants", () => {
  it("is a 20x20 = 400 cell grid", () => {
    expect(TOTAL_CELLS).toBe(400);
  });

  it("anchors on the exact disclosed dates", () => {
    expect(NYSE_FOUNDING.getUTCFullYear()).toBe(1792);
    expect(NYSE_FOUNDING.getUTCMonth()).toBe(4); // May
    expect(NYSE_FOUNDING.getUTCDate()).toBe(17);
    expect(COLUMBUS_LANDING.getUTCFullYear()).toBe(1492);
    expect(COLUMBUS_LANDING.getUTCMonth()).toBe(9); // October
    expect(COLUMBUS_LANDING.getUTCDate()).toBe(12);
  });
});

describe("the two disclosed worked examples: 1929 -> 137, 1932 -> 140", () => {
  it("1929 is exactly 137 years after the 1792 NYSE founding", () => {
    expect(yearsElapsed(NYSE_FOUNDING, new Date(Date.UTC(1929, 0, 1)))).toBe(137);
    expect(WORKED_EXAMPLES.nineteenTwentyNine.cellNumber).toBe(137);
  });

  it("1932 is exactly 140 years after the 1792 NYSE founding", () => {
    expect(yearsElapsed(NYSE_FOUNDING, new Date(Date.UTC(1932, 0, 1)))).toBe(140);
    expect(WORKED_EXAMPLES.nineteenThirtyTwo.cellNumber).toBe(140);
  });

  it("dateToGridCell in year-mode reproduces both cell numbers directly", () => {
    expect(dateToGridCell(NYSE_FOUNDING, new Date(Date.UTC(1929, 0, 1)), "year")).toBe(137);
    expect(dateToGridCell(NYSE_FOUNDING, new Date(Date.UTC(1932, 0, 1)), "year")).toBe(140);
  });
});

describe("ringAndAngleOf — internal spiral model (see module header: geometry not independently verifiable)", () => {
  it("places the center cell (1) at ring 0", () => {
    expect(ringAndAngleOf(1)).toEqual({ ring: 0, angleDeg: 0 });
  });

  it("assigns consistent, monotonically non-decreasing rings outward", () => {
    let prevRing = 0;
    for (let n = 1; n <= 400; n++) {
      const { ring } = ringAndAngleOf(n);
      expect(ring).toBeGreaterThanOrEqual(prevRing);
      prevRing = ring;
    }
  });

  it("rejects non-positive or non-integer cell numbers", () => {
    expect(() => ringAndAngleOf(0)).toThrow();
    expect(() => ringAndAngleOf(1.5)).toThrow();
  });

  it("returns a well-formed ring/angle for both worked-example cells", () => {
    const a = ringAndAngleOf(137);
    const b = ringAndAngleOf(140);
    expect(a.ring).toBeGreaterThan(0);
    expect(b.ring).toBeGreaterThan(0);
    expect(a.angleDeg).toBeGreaterThanOrEqual(0);
    expect(a.angleDeg).toBeLessThan(360);
  });
});

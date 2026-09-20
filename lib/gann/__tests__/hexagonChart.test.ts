import { describe, expect, it } from "vitest";
import {
  HEXAGON_RINGS,
  centeredHexagonalNumbers,
  monthsToYearsMonths,
  SEVEN_YEAR_CYCLE_MONTHS,
  RING_169_TIME_COUNT,
  CROSS_CONSTRUCTION_EXAMPLE,
  describeCrossConstructionConfluence,
} from "../hexagonChart";

describe("centeredHexagonalNumbers (3n^2 + 3n + 1)", () => {
  it("reproduces the disclosed list exactly: 1, 7, 19, 37, 61, 91, 127, 169, 217, 271, 331, 397", () => {
    const values = centeredHexagonalNumbers(12).map((r) => r.value);
    expect(values).toEqual([1, 7, 19, 37, 61, 91, 127, 169, 217, 271, 331, 397]);
  });

  it("HEXAGON_RINGS matches the formula directly", () => {
    for (const ring of HEXAGON_RINGS) {
      expect(ring.value).toBe(3 * ring.n * ring.n + 3 * ring.n + 1);
    }
  });
});

describe("the 169 = 14 years 1 month claim, double the 7-year cycle", () => {
  it("splits 169 months into 14 years and 1 month", () => {
    expect(monthsToYearsMonths(169)).toEqual({ years: 14, months: 1 });
  });

  it("14 years is exactly double the disclosed 7-year cycle", () => {
    expect(SEVEN_YEAR_CYCLE_MONTHS).toBe(84);
    expect(SEVEN_YEAR_CYCLE_MONTHS * 2).toBe(168); // 14 years, to the month
    expect(RING_169_TIME_COUNT.years).toBe(14);
    expect(RING_169_TIME_COUNT.months).toBe(1);
    expect(RING_169_TIME_COUNT.totalMonths).toBe(169);
  });
});

describe("the cross-construction confluence citation (66 / Master Twelve / squareOf9 / Hexagon 180 deg)", () => {
  it("carries the exact cited number, constructions, and angle", () => {
    const example = describeCrossConstructionConfluence();
    expect(example).toBe(CROSS_CONSTRUCTION_EXAMPLE);
    expect(example.number).toBe(66);
    expect(example.hexagonAngleDeg).toBe(180);
    expect(example.constructions).toContain("Master Twelve Chart");
    expect(example.constructions).toContain("squareOf9 construction");
    expect(example.constructions).toContain("Hexagon Chart");
  });
});

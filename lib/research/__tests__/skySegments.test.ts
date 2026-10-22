import { describe, expect, it } from "vitest";
import {
  binomialUpperTail,
  galacticCentreEvents,
  monthRose,
  runSkySegmentTest,
} from "../skySegments";

describe("binomialUpperTail", () => {
  it("matches exact values", () => {
    expect(binomialUpperTail(0, 10, 0.5)).toBe(1);
    expect(binomialUpperTail(11, 10, 0.5)).toBe(0);
    expect(binomialUpperTail(10, 10, 0.5)).toBeCloseTo(1 / 1024, 10);
    expect(binomialUpperTail(9, 10, 0.5)).toBeCloseTo(11 / 1024, 10);
    expect(binomialUpperTail(3, 10, 0)).toBe(0);
    expect(binomialUpperTail(3, 10, 1)).toBe(1);
  });
});

describe("galacticCentreEvents", () => {
  it("finds each event once, near the segment, on the aspect", () => {
    const events = galacticCentreEvents(1897, 1910);
    const keys = events.map((e) => `${e.date}${e.pair}${e.aspect}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const e of events) {
      const [a, b] = e.longitudes;
      const sep = Math.abs((((a - b) % 360) + 360) % 360);
      const fold = sep > 180 ? 360 - sep : sep;
      // Within a day's motion of the exact aspect (Mercury moves up to ~2.2° a day).
      expect(e.aspect === "conjunction" ? fold : 180 - fold).toBeLessThan(3);
      const near = [a, b].some((l) => {
        const d = Math.abs((((l - 267) % 360) + 360) % 360);
        return Math.min(d, 360 - d) <= 15;
      });
      expect(near).toBe(true);
    }
  });
});

describe("monthRose", () => {
  it("reads the month against the one before, across a year end", () => {
    expect(typeof monthRose(1929, 11)).toBe("boolean");
    expect(monthRose(1929, 11)).toBe(false); // the crash
    expect(typeof monthRose(1930, 1)).toBe("boolean");
    expect(monthRose(1850, 1)).toBeNull();
  });
});

describe("the pre-registered test", () => {
  it("pins the 2026-10-22 result: no replication", () => {
    expect(galacticCentreEvents(1897, 1961)).toHaveLength(47);
    expect(galacticCentreEvents(1962, 2026)).toHaveLength(42);
    const [dewey, holdout] = runSkySegmentTest();
    expect(dewey.baseRate).toBeCloseTo(0.579, 3);
    expect(holdout.baseRate).toBeCloseTo(0.622, 3);
    expect(dewey).toMatchObject({ events: 40, hits: 26, holmSignificant: false });
    expect(dewey.p).toBeCloseTo(0.23, 2);
    expect(holdout).toMatchObject({ events: 37, hits: 23, holmSignificant: false });
    expect(holdout.p).toBeCloseTo(0.57, 2);
  }, 60_000);
});

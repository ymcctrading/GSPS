import { describe, expect, it } from "vitest";
import { oddFortyEighthAt, readMasterChartTime, SEVENTH, seventhAt } from "../masterChartTime";

describe("the Master Chart of 360°'s 48ths and sevenths", () => {
  it("counts only the odd multiples of 7½° as new 48ths", () => {
    expect(oddFortyEighthAt(22.6, 0.5)).toBe(22.5);
    expect(oddFortyEighthAt(37.5, 0.5)).toBe(37.5);
    expect(oddFortyEighthAt(15, 0.5)).toBeNull();
    expect(oddFortyEighthAt(25, 0.5)).toBeNull();
  });

  it("gives the sevenths of the circle and the named counts by unit", () => {
    expect(SEVENTH).toBeCloseTo(51.4286, 3);
    expect(seventhAt("days", 49, 49, 1)).toBe(49);
    expect(seventhAt("days", 77, 77, 1)).toBe(77);
    expect(seventhAt("weeks", 7, 7, 0.5)).toBe(7);
    expect(seventhAt("days", 7, 7, 1)).toBeNull();
    expect(seventhAt("months", 102.9, 102.9, 0.5)).toBeCloseTo(2 * SEVENTH, 6);
    expect(seventhAt("months", 30, 30, 0.5)).toBeNull();
  });

  it("reads the 49th day from the low", () => {
    const end = Date.parse("2026-10-16T00:00:00Z");
    const start = end - 49 * 86_400_000;
    const hits = readMasterChartTime([
      { t: new Date(start).toISOString(), h: 10, l: 5 },
      { t: new Date(end).toISOString(), h: 20, l: 15 },
    ]);
    const days = hits.find((h) => h.pivot === "low" && h.unit === "days");
    expect(days?.seventh).toBe(49);
    expect(days?.fortyEighth).toBeNull();
    expect(hits.find((h) => h.pivot === "low" && h.unit === "weeks")?.seventh).toBe(7);
  });
});

import { describe, expect, it } from "vitest";
import { marketMonth, readMassPressure, describeMassPressure } from "@/lib/gann/massPressure";

describe("mass pressure (A-OTHER-05)", () => {
  it("lays the years 10, 20, 30 and 60 back over the month, as the 1929 forecast did", () => {
    const r = readMassPressure(new Date("1929-09-16T16:00:00Z"));
    expect(r?.month).toBe("1929-09");
    expect(r?.years.map((y) => y.year)).toEqual([1919, 1909, 1899, 1869].filter((y) => y >= 1871));
  });

  it("averages each year's centred move in the month and reads its sign", () => {
    const asOf = new Date("2026-10-15T16:00:00Z");
    const r = readMassPressure(asOf)!;
    expect(r.years.map((y) => y.yearsBack)).toEqual([10, 20, 30, 60]);
    for (const y of r.years) {
      const before = marketMonth("stocks", y.year, 9)!;
      const after = marketMonth("stocks", y.year, 11)!;
      expect(y.change).toBeCloseTo(after / before - 1, 12);
    }
    const mean = r.years.reduce((s, y) => s + y.change, 0) / 4;
    expect(r.composite).toBeCloseTo(mean, 12);
    expect(r.direction).toBe(mean > 0 ? "bullish" : "bearish");
    expect(describeMassPressure(r)).toContain("2016, 2006, 1996, 1966");
  });

  it("reads the month in New York time", () => {
    // 01:00 UTC on 1 November is still 31 October in New York.
    expect(readMassPressure(new Date("2026-11-01T01:00:00Z"))?.month).toBe("2026-10");
  });

  it("crosses the year end for December and January", () => {
    const dec = readMassPressure(new Date("2026-12-15T16:00:00Z"))!;
    const y = dec.years[0];
    expect(y.change).toBeCloseTo(marketMonth("stocks", 2017, 1)! / marketMonth("stocks", 2016, 11)! - 1, 12);
  });

  it("returns null before the record reaches any year back", () => {
    expect(readMassPressure(new Date("1875-06-15T16:00:00Z"))).toBeNull();
    expect(marketMonth("stocks", 1870, 12)).toBeNull();
  });
});

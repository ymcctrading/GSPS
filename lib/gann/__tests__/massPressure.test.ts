import { describe, expect, it } from "vitest";
import { marketMonth, readMassPressure, describeMassPressure } from "@/lib/gann/massPressure";

describe("mass pressure (A-OTHER-05)", () => {
  it("lays every decade back to 70 years over the month, as the 1936 forecast did", () => {
    const r = readMassPressure(new Date("1936-08-14T16:00:00Z"));
    expect(r?.month).toBe("1936-08");
    // 1866 is before the record (1871); 1926 to 1876 are read, 1896 among them.
    expect(r?.years.map((y) => y.year)).toEqual([1926, 1916, 1906, 1896, 1886, 1876]);
  });

  it("averages each year's centred move in the month and reads its sign", () => {
    const asOf = new Date("2026-10-15T16:00:00Z");
    const r = readMassPressure(asOf)!;
    expect(r.years.map((y) => y.yearsBack)).toEqual([10, 20, 30, 40, 50, 60, 70]);
    for (const y of r.years) {
      const before = marketMonth("stocks", y.year, 9)!;
      const after = marketMonth("stocks", y.year, 11)!;
      expect(y.change).toBeCloseTo(after / before - 1, 12);
    }
    const mean = r.years.reduce((s, y) => s + y.change, 0) / 7;
    expect(r.composite).toBeCloseTo(mean, 12);
    expect(r.direction).toBe(mean > 0 ? "bullish" : "bearish");
    expect(describeMassPressure(r)).toContain("2016, 2006, 1996, 1986, 1976, 1966, 1956");
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

  it("reads the sign the record gives, on a month whose years back all agree", () => {
    // A month where every year read moved the same way pins the sign
    // independently of the averaging.
    let pinned = 0;
    for (let y = 1945; y <= 2026 && pinned < 2; y++) {
      for (let m = 1; m <= 12; m++) {
        const r = readMassPressure(new Date(Date.UTC(y, m - 1, 15, 16)));
        if (!r || r.years.length < 3) continue;
        if (r.years.every((x) => x.change < 0)) {
          expect(r.direction).toBe("bearish");
          pinned++;
        } else if (r.years.every((x) => x.change > 0)) {
          expect(r.direction).toBe("bullish");
          pinned++;
        }
      }
    }
    expect(pinned).toBeGreaterThan(0);
  });

  it("reads null past the record's far end", () => {
    expect(marketMonth("stocks", 2026, 9)).not.toBeNull();
    expect(marketMonth("stocks", 2026, 10)).toBeNull();
    expect(marketMonth("stocks", 2099, 1)).toBeNull();
  });

  it("returns null before the record reaches any year back", () => {
    expect(readMassPressure(new Date("1875-06-15T16:00:00Z"))).toBeNull();
    expect(marketMonth("stocks", 1870, 12)).toBeNull();
  });
});

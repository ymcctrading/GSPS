import { describe, expect, it } from "vitest";
import { marketCountHit } from "@/lib/gann/eightyFourYear";

const mid = (y: number, m: number) => new Date(Date.UTC(y, m - 1, 15, 16));

describe("the 84-year count on the market's record (C-ASTRO-05)", () => {
  it("finds the market's own major turns 84 years back to the month", () => {
    // August 1896, the low Gann names in the 1936 forecast (Master Course Ch. 7, PDF 227-228).
    expect(marketCountHit(mid(1980, 8))).toEqual({ years: 84, kind: "low", pivotMonth: "1896-08" });
    // September 1929, the top.
    expect(marketCountHit(mid(2013, 9))).toEqual({ years: 84, kind: "high", pivotMonth: "1929-09" });
    // April 1942, the wartime low.
    expect(marketCountHit(mid(2026, 4))).toEqual({ years: 84, kind: "low", pivotMonth: "1942-04" });
  });

  it("needs the exact month, as the stock's yearly counts do", () => {
    expect(marketCountHit(mid(2026, 3))).toBeNull();
    expect(marketCountHit(mid(2026, 5))).toBeNull();
  });

  it("reads the month in New York time", () => {
    // 01:00 UTC on 1 May is still 30 April in New York.
    expect(marketCountHit(new Date("2026-05-01T01:00:00Z"))?.pivotMonth).toBe("1942-04");
  });

  it("finds nothing before the record reaches 84 years back", () => {
    expect(marketCountHit(mid(1950, 6))).toBeNull();
  });
});

describe("the long counts in P1 (84, 90 and 100 years, 2026-10-28)", () => {
  it("reads every long count landing on the month", async () => {
    const { marketCountHits } = await import("@/lib/gann/eightyFourYear");
    expect(marketCountHits(mid(2026, 4))).toContainEqual({ years: 84, kind: "low", pivotMonth: "1942-04" });
    // September 1929's top, 100 years on.
    expect(marketCountHits(mid(2029, 9)).map((h) => h.years)).toContain(100);
    expect(marketCountHits(mid(2029, 9)).find((h) => h.years === 100)?.kind).toBe("high");
  });
});

import { describe, expect, it } from "vitest";
import { marketMonth, readCurve, readMassPressure } from "@/lib/gann/massPressure";
import { readThreeCurves } from "@/lib/gann/threeCurves";

const asOf = new Date("2026-10-15T16:00:00Z");

describe("the three curves (A-TIME-13, labelled reconstruction)", () => {
  it("reads the curve of stocks as mass pressure does", () => {
    expect(readCurve("stocks", asOf)).toEqual(readMassPressure(asOf));
  });

  it("reads the money and commodity curves on the rate and the price index the same way", () => {
    const money = readCurve("rate", asOf)!;
    expect(money.years).toHaveLength(7);
    const y = money.years[0];
    expect(y.change).toBeCloseTo(marketMonth("rate", 2016, 11)! / marketMonth("rate", 2016, 9)! - 1, 12);
    expect(readCurve("cpi", asOf)?.years).toHaveLength(7);
  });

  it("flags a curve running against the curve of stocks", () => {
    const r = readThreeCurves(asOf)!;
    const against = (d: typeof r.money) => d !== null && d !== r.stocks;
    expect(r.disagree).toBe(against(r.money) || against(r.commodity));
  });

  it("has nothing to compare before the record reaches a year back", () => {
    expect(readThreeCurves(new Date("1875-06-15T16:00:00Z"))).toBeNull();
  });
});

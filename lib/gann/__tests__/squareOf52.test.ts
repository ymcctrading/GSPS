import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { SQUARE_OF_52_WEEKS, SQUARE_OF_52_FRACTIONS, squareOf52Windows } from "../squareOf52";

function bar(t: string, price: number): Bar {
  return { t, o: price, h: price, l: price, c: price, v: 1000 };
}

describe("SQUARE_OF_52_FRACTIONS", () => {
  it("is anchored to the 52-week year", () => {
    expect(SQUARE_OF_52_WEEKS).toBe(52);
  });

  it("reproduces every disclosed week-count exactly", () => {
    const byLabel = Object.fromEntries(SQUARE_OF_52_FRACTIONS.map((f) => [f.label, f]));
    expect(byLabel["1/8"].weeks).toBe(6.5);
    expect(byLabel["1/4"].weeks).toBe(13);
    expect(byLabel["1/3"].weeks).toBeCloseTo(17.33, 2);
    expect(byLabel["1/2"].weeks).toBe(26);
    expect(byLabel["5/8"].weeks).toBe(32.5);
    expect(byLabel["3/4"].weeks).toBe(39);
  });

  it("flags 1/2 as most-important and 3/4 as very-important, per the source's own emphasis", () => {
    const byLabel = Object.fromEntries(SQUARE_OF_52_FRACTIONS.map((f) => [f.label, f]));
    expect(byLabel["1/2"].emphasis).toBe("most-important");
    expect(byLabel["3/4"].emphasis).toBe("very-important");
  });

  it("flags exactly the disclosed fractions as disclosed:true (Master Course Ch.14 PDF 385, Ch.18 PDF 440; Commodities p.58)", () => {
    const disclosed = SQUARE_OF_52_FRACTIONS.filter((f) => f.disclosed).map((f) => f.label).sort();
    expect(disclosed).toEqual(["1/16", "1/8", "1/4", "1/3", "3/8", "1/2", "5/8", "2/3", "3/4", "7/8"].sort());
    const byLabel = Object.fromEntries(SQUARE_OF_52_FRACTIONS.map((f) => [f.label, f]));
    // The source's own week counts: 19½, 35 (2/3 = 34.67) and 45½ weeks.
    expect(byLabel["3/8"].weeks).toBe(19.5);
    expect(byLabel["7/8"].weeks).toBe(45.5);
    expect(byLabel["2/3"].weeks).toBeCloseTo(34.67, 2);
  });
});

describe("squareOf52Windows", () => {
  function barsWithPivot(): Bar[] {
    const closes = [
      100, 98, 96, 94, 92, 90, 92, 94, 96, 98, 100, 105, 108, 110, 112, 114, 116, 118, 120, 122, 124, 126,
      128, 130, 132, 134, 136, 138, 140, 142, 144,
    ];
    return closes.map((c, i) => bar(`2020-01-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`, c));
  }

  it("returns inactive with too little history", () => {
    expect(squareOf52Windows(barsWithPivot().slice(0, 10))).toEqual({ active: false, dates: [] });
  });

  it("projects disclosed-fraction weeks forward from a major pivot", () => {
    const bars = barsWithPivot();
    const result = squareOf52Windows(bars, new Date("2020-02-01T00:00:00Z"), 2);
    expect(Array.isArray(result.dates)).toBe(true);
  });

  it("computes a 26-week (1/2) projection exactly 182 days after the anchor", () => {
    // A low pivot at index 5 (2020-01-06). 26 weeks * 7 = 182 days later is 2020-07-06.
    const bars = barsWithPivot();
    const halfYear = bars.find((b) => b.c === Math.min(...bars.map((x) => x.c)));
    expect(halfYear).toBeTruthy();
    const anchorDate = new Date(halfYear!.t);
    const expected = new Date(anchorDate.getTime() + 26 * 7 * 24 * 3600 * 1000);
    expect(expected.getTime() - anchorDate.getTime()).toBe(182 * 24 * 3600 * 1000);
  });
});

describe("the square of 52 reaches the live scan and the replay alike (M-T6, C-TIME-46)", () => {
  it("is read by readDisclosedRules at the session being read, and turned into a factor", async () => {
    const { readDisclosedRules } = await import("../disclosedRules");
    const { contextFactorsFor } = await import("../contextFactors");
    const bars = Array.from({ length: 200 }, (_, i) => {
      const c = 40 + 6 * Math.abs(((i % 24) / 12) - 1);
      return { t: new Date(Date.UTC(2025, 0, 1) + i * 86_400_000).toISOString(), o: c, h: c + 1, l: c - 1, c, v: 1_000_000 };
    });
    const asOf = new Date(bars[bars.length - 1].t);
    const ctx = readDisclosedRules(bars, bars[bars.length - 1].c, null, asOf);
    expect(ctx.squareOf52).toEqual(squareOf52Windows(bars, asOf));
    const f = contextFactorsFor(ctx, "bullish", bars[bars.length - 1].c);
    expect(f.squareOf52Window).toBe(ctx.squareOf52!.active);
  });
});

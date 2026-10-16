import { describe, expect, it } from "vitest";
import { computeDecadeCycle } from "../decadeCycle";

describe("computeDecadeCycle", () => {
  it("reads a '1' year (bear ends, bull begins) as bullish", () => {
    expect(computeDecadeCycle(new Date("2021-06-01T00:00:00Z"))).toMatchObject({
      yearDigit: 1,
      bias: "bullish",
    });
  });

  it("reads a '9' year (strongest bull peak, then reversal) as mixed", () => {
    expect(computeDecadeCycle(new Date("2029-06-01T00:00:00Z"))).toMatchObject({
      yearDigit: 9,
      bias: "mixed",
    });
  });

  it("reads a year ending in 0 as digit 10, per the source's own numbering convention", () => {
    expect(computeDecadeCycle(new Date("2030-06-01T00:00:00Z"))).toMatchObject({
      yearDigit: 10,
      bias: "bearish",
    });
  });

  it("reads a '7' year as bearish", () => {
    expect(computeDecadeCycle(new Date("2027-06-01T00:00:00Z"))).toMatchObject({
      yearDigit: 7,
      bias: "bearish",
    });
  });

  it("marks the decade's 90th month in an '8' year (Master Course Ch.7 PDF 223-224, 1935)", () => {
    // Month 1 is January of the '1' year, so month 90 is June of the '8' year.
    expect(computeDecadeCycle(new Date("2028-06-15T00:00:00Z")).ninetiethMonth).toEqual({ month: "2028-06", active: true });
    expect(computeDecadeCycle(new Date("2028-02-15T00:00:00Z")).ninetiethMonth).toEqual({ month: "2028-06", active: false });
    expect(computeDecadeCycle(new Date("2027-06-15T00:00:00Z")).ninetiethMonth).toBeUndefined();
  });
});

describe("the decade digit reaches the live scan and the replay alike (M-T17, C-TIME-24)", () => {
  it("is read by readDisclosedRules at the session being read, and turned into factors", async () => {
    const { readDisclosedRules } = await import("../disclosedRules");
    const { contextFactorsFor } = await import("../contextFactors");
    const bars = Array.from({ length: 60 }, (_, i) => {
      const c = 50 + (i % 10);
      return { t: new Date(Date.UTC(2028, 4, 1) + i * 86_400_000).toISOString(), o: c, h: c + 1, l: c - 1, c, v: 1_000_000 };
    });
    // June 2028: an '8' year (bull) and its 90th month.
    const asOf = new Date("2028-06-15T20:00:00Z");
    const ctx = readDisclosedRules(bars, 55, null, asOf);
    expect(ctx.decadeCycle).toEqual(computeDecadeCycle(asOf));
    expect(contextFactorsFor(ctx, "bullish", 55).decadeYearWithTrade).toBe(true);
    expect(contextFactorsFor(ctx, "bearish", 55).decadeYearWithTrade).toBe(false);
    expect(contextFactorsFor(ctx, "bullish", 55).decadeNinetiethMonth).toBe(true);
  });
});

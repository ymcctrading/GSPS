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

describe("the turns named inside a year (Master Course Ch. 7, PDF 223-224)", () => {
  const at = (iso: string) => computeDecadeCycle(new Date(iso));

  it("a '6' year is bullish to August, its fall culmination mixed, and December bearish", () => {
    expect(at("2026-06-15T12:00:00Z")).toMatchObject({ bias: "bullish", currentBias: "bullish" });
    // The 2026-08-24 to 2026-10-20 replay window: the campaign "ends in the Fall".
    expect(at("2026-09-01T12:00:00Z").currentBias).toBe("mixed");
    expect(at("2026-10-20T12:00:00Z").currentBias).toBe("mixed");
    expect(at("2026-11-30T12:00:00Z").currentBias).toBe("mixed");
    expect(at("2026-12-15T12:00:00Z").currentBias).toBe("bearish");
    // The year's label is unchanged (the card heading, CYC-52's 1 July read).
    expect(at("2026-10-20T12:00:00Z").bias).toBe("bullish");
  });

  it("a '9' year is bullish to August, mixed September to November, bearish in December", () => {
    expect(at("2029-03-15T12:00:00Z")).toMatchObject({ bias: "mixed", currentBias: "bullish" });
    expect(at("2029-10-15T12:00:00Z").currentBias).toBe("mixed");
    expect(at("2029-12-15T12:00:00Z").currentBias).toBe("bearish");
  });

  it("'3' and '10' years rally to March/April (mixed) and read bearish from May", () => {
    expect(at("2033-02-15T12:00:00Z").currentBias).toBe("mixed");
    expect(at("2033-05-01T12:00:00Z").currentBias).toBe("bearish");
    expect(at("2030-04-30T12:00:00Z").currentBias).toBe("mixed");
    expect(at("2030-05-01T12:00:00Z").currentBias).toBe("bearish");
  });

  it("digits with no named turn read the year's label every month", () => {
    for (const m of ["01", "06", "12"]) {
      expect(at(`2027-${m}-15T12:00:00Z`).currentBias).toBe("bearish");
      expect(at(`2025-${m}-15T12:00:00Z`).currentBias).toBe("bullish");
    }
  });
});

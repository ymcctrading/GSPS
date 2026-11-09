import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { readAscension, readAscensionCount } from "../disclosedRules";
import { contextFactorsFor } from "../contextFactors";
import { EMPTY_DISCLOSED_RULES, describeDisclosedRules } from "../disclosedRules";

function daily(closes: number[]): Bar[] {
  return closes.map((c, i) => ({
    t: new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString(),
    o: c,
    h: c + 0.5,
    l: c - 0.5,
    c,
    v: 1000,
  }));
}

describe("C-TREND-08: the 5th unit of a run is the unit of Ascension (Master Course Ch.7 PDF 223)", () => {
  it("counts consecutive higher closes and flags the 5th", () => {
    const r = readAscensionCount(daily([10, 9, 10, 11, 12, 13, 14]))!;
    expect(r).toEqual({ direction: "up", count: 5, fifth: true });
  });

  it("does not flag the 4th or the 6th", () => {
    expect(readAscensionCount(daily([10, 9, 10, 11, 12, 13]))!.fifth).toBe(false);
    expect(readAscensionCount(daily([10, 9, 10, 11, 12, 13, 14, 15]))!.fifth).toBe(false);
  });

  it("mirrors on lower closes", () => {
    expect(readAscensionCount(daily([10, 11, 10, 9, 8, 7, 6]))).toEqual({ direction: "down", count: 5, fifth: true });
  });

  it("reads days, weeks and months", () => {
    const closes = Array.from({ length: 200 }, (_, i) => 100 + i);
    const r = readAscension(daily(closes));
    expect(r.daily!.count).toBe(199);
    expect(r.weekly).not.toBeNull();
    expect(r.monthly).not.toBeNull();
  });

  it("is a factor in the trade's direction and a line on the card", () => {
    const ctx = {
      ...EMPTY_DISCLOSED_RULES,
      ascension: { daily: { direction: "up" as const, count: 5, fifth: true }, weekly: null, monthly: null },
    };
    expect(contextFactorsFor(ctx, "bullish", 100).ascensionUnitWithTrade).toBe(true);
    expect(contextFactorsFor(ctx, "bearish", 100).ascensionUnitWithTrade).toBe(false);
    expect(describeDisclosedRules(ctx).some((l) => l.includes("5th"))).toBe(true);
  });
});

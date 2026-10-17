/**
 * A-SELECTION-07 (New Stock Trend Detector, 1936, Ch. V pp. 38-39): stocks
 * with a small number of shares can be sold short for the widest declines.
 * Read as heavy weekly turnover against shares outstanding; 1930s share
 * counts are not ported. Context only, recorded on short candidates.
 */
import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { readCapitalStock, SMALL_FLOAT_MEDIAN_WEEK_TURNOVER } from "@/lib/gann/capitalStock";
import { describeDisclosedRules, readDisclosedRules, toWeeklyBars } from "@/lib/gann/disclosedRules";
import { contextFactorsFor } from "@/lib/gann/contextFactors";

/** Weekday bars from 2026-01-05 on 1,000 shares a day, gently oscillating. */
function bars(n: number): Bar[] {
  const out: Bar[] = [];
  let d = Date.UTC(2026, 0, 5);
  for (let i = 0; i < n; i++) {
    while ([0, 6].includes(new Date(d).getUTCDay())) d += 86_400_000;
    const c = 50 + Math.sin(i / 5) * 3;
    out.push({ t: new Date(d).toISOString(), o: c, h: c + 0.5, l: c - 0.5, c, v: 1000 });
    d += 86_400_000;
  }
  return out;
}
const DAILY = bars(65);
const read = (shares: number) => readCapitalStock(DAILY, toWeeklyBars(DAILY), shares)!;

describe("a small number of shares (A-SELECTION-07)", () => {
  it("is a median week turning over a tenth of the stock or more", () => {
    expect(SMALL_FLOAT_MEDIAN_WEEK_TURNOVER).toBe(0.1);
    // 5,000 a week against 40,000 shares is 12.5%; against 100,000 it is 5%.
    expect(read(40_000).medianWeekTurnover).toBeCloseTo(0.125);
    expect(read(40_000).smallFloat).toBe(true);
    expect(read(50_000).smallFloat).toBe(true);
    expect(read(100_000).smallFloat).toBe(false);
  });

  it("counts on a short and is not read on a long", () => {
    const asOf = new Date(DAILY[DAILY.length - 1].t);
    const ctx = readDisclosedRules(DAILY, DAILY[DAILY.length - 1].c, { sharesOutstanding: 40_000, inception: null }, asOf);
    expect(contextFactorsFor(ctx, "bearish", 50).smallFloatShort).toBe(true);
    expect(contextFactorsFor(ctx, "bullish", 50).smallFloatShort).toBeUndefined();
    expect(describeDisclosedRules(ctx).some((l) => /small number of shares/.test(l) && /Shown for context/.test(l))).toBe(true);
    const big = readDisclosedRules(DAILY, 50, { sharesOutstanding: 100_000, inception: null }, asOf);
    expect(contextFactorsFor(big, "bearish", 50).smallFloatShort).toBe(false);
  });
});

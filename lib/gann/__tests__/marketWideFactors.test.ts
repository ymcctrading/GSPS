import { describe, expect, it } from "vitest";
import { readDisclosedRules } from "@/lib/gann/disclosedRules";
import { contextFactorsFor } from "@/lib/gann/contextFactors";
import { readMassPressure } from "@/lib/gann/massPressure";
import { readDollarTrend } from "@/lib/gann/dollarTrend";
import type { Bar } from "@/lib/types";

const daily: Bar[] = Array.from({ length: 80 }, (_, i) => {
  const c = 50 + (i % 9);
  return { t: new Date(Date.UTC(2026, 3, 1) + i * 86_400_000).toISOString(), o: c, h: c + 1, l: c - 1, c, v: 1_000_000 };
});
const asOf = new Date("2026-04-15T16:00:00Z");

function months(closes: number[]): Bar[] {
  return closes.map((c, i) => ({ t: new Date(Date.UTC(2024, i, 1)).toISOString(), o: c, h: c + 1, l: c - 1, c, v: 1 }));
}

describe("market-wide context factors read for a stock only", () => {
  it("records mass pressure and the 84-year count for a stock, and neither for an instrument with no market read", () => {
    const stock = readDisclosedRules(daily, 55, { sharesOutstanding: null, inception: null, marketDaily: daily }, asOf);
    const crypto = readDisclosedRules(daily, 55, null, asOf);
    expect(stock.stockMarket).toBe(true);
    expect(crypto.stockMarket).toBe(false);
    const s = contextFactorsFor(stock, "bullish", 55);
    const c = contextFactorsFor(crypto, "bullish", 55);
    expect(s.massPressureWithTrade).toBe(readMassPressure(asOf)!.direction === "bullish");
    // April 2026 is 84 years from the April 1942 low: a low due, with a long.
    expect(s.eightyFourYearCountWithTrade).toBe(true);
    expect(contextFactorsFor(stock, "bearish", 55).eightyFourYearCountWithTrade).toBe(false);
    expect(c.massPressureWithTrade).toBeUndefined();
    expect(c.eightyFourYearCountWithTrade).toBeUndefined();
  });
});

describe("the Dollar Trend (A-OTHER-06)", () => {
  it("turns up on crossing the last monthly swing top and down on breaking the last bottom", () => {
    const up = months([10, 12, 14, 13, 12, 11, 12, 13, 15, 16]);
    expect(readDollarTrend(up)?.direction).toBe("bullish");
    const down = months([16, 14, 12, 13, 14, 15, 14, 13, 11, 10]);
    expect(readDollarTrend(down)?.direction).toBe("bearish");
  });

  it("reads nothing on fewer than six months", () => {
    expect(readDollarTrend(months([10, 11, 12]))).toBeNull();
    expect(readDollarTrend(null)).toBeNull();
  });
});

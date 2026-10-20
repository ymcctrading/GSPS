import { describe, expect, it } from "vitest";
import { STRENGTH_MONTHS, readMonthlyStrength } from "@/lib/gann/leadership";
import type { Bar } from "@/lib/types";

/** Monthly bars from Jan 2025, each a 2-point range around `mid(i)`. */
function months(n: number, mid: (i: number) => number): Bar[] {
  return Array.from({ length: n }, (_, i) => {
    const m = mid(i);
    const d = new Date(Date.UTC(2025, i, 1)).toISOString();
    return { t: d, o: m, h: m + 1, l: m - 1, c: m, v: 1000 };
  });
}

/** One closed daily bar in the month after the monthly series, closing at `c`. */
function dayAfter(n: number, c: number): Bar[] {
  return [{ t: new Date(Date.UTC(2025, n, 3)).toISOString(), o: c, h: c + 0.5, l: c - 0.5, c, v: 1000 }];
}

describe("monthly highs and lows against the market (S6)", () => {
  const n = STRENGTH_MONTHS + 2;
  const market = months(n, () => 100 + 0); // flat: the close sits mid-range
  const marketDaily = dayAfter(n, 100);

  it("calls a stock at the top of its year's range stronger than a market mid-range", () => {
    const stock = months(n, (i) => 50 + i);
    const r = readMonthlyStrength(stock, dayAfter(n, 50 + n), market, marketDaily);
    expect(r?.stronger).toBe(true);
    expect(r?.weaker).toBe(false);
  });

  it("mirrors for a stock at the bottom of its range", () => {
    const stock = months(n, (i) => 80 - i);
    const r = readMonthlyStrength(stock, dayAfter(n, 80 - n), market, marketDaily);
    expect(r?.weaker).toBe(true);
    expect(r?.stronger).toBe(false);
  });

  it("does not read the market past the stock's last session", () => {
    // A market month after the stock's last session must not count.
    const later = [...market, { t: new Date(Date.UTC(2025, n + 1, 1)).toISOString(), o: 300, h: 300, l: 300, c: 300, v: 1 }];
    const stock = months(n, (i) => 50 + i);
    const a = readMonthlyStrength(stock, dayAfter(n, 50 + n), market, marketDaily);
    const b = readMonthlyStrength(stock, dayAfter(n, 50 + n), later, [...marketDaily, ...dayAfter(n + 1, 300)]);
    expect(b).toEqual(a);
  });

  it("is unread without a year of months or the market", () => {
    expect(readMonthlyStrength(months(5, () => 10), dayAfter(5, 10), market, marketDaily)).toBeNull();
    expect(readMonthlyStrength(months(n, () => 10), dayAfter(n, 10), null, marketDaily)).toBeNull();
  });
});

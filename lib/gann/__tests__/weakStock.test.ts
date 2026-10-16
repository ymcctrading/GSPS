/**
 * Gann's weak stocks in a bull market (PLAN.md item 6 step 9): a stock that
 * tops in the first or second year and fails for two years to exceed it
 * (A-TREND-07, W006 pp.25, 27, Corn Products), and one that rallies only two
 * or three months at the start and never exceeds that rally (A-TREND-08,
 * p.35, American Home Products 25 to 43 3/4, back to 25, up to 36). Dated
 * from the market's bull market (fork F6 a). Context only.
 */
import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { marketBullStart, monthlyWithCurrent, readWeakStock } from "@/lib/gann/leadership";
import { describeDisclosedRules, readDisclosedRules } from "@/lib/gann/disclosedRules";
import { contextFactorsFor } from "@/lib/gann/contextFactors";

const leg = (from: number, to: number, n: number) => Array.from({ length: n }, (_, i) => from + ((to - from) * (i + 1)) / n);
/** One bar a month from January 2019; each bar spans 1% around its close. */
function months(closes: number[]): Bar[] {
  return closes.map((c, i) => {
    const d = new Date(Date.UTC(2019, i, 1, 5));
    return { t: d.toISOString(), o: c, h: c * 1.01, l: c * 0.99, c, v: 1e8 };
  });
}
const month = (i: number) => new Date(Date.UTC(2019, i, 1)).toISOString().slice(0, 7);

// The market: a rise, a bear market to a low in month 14 (March 2020), then a
// bull market with two-month reactions that never break the last bottom.
const MARKET = months([
  ...leg(100, 130, 8), ...leg(130, 80, 6),
  ...[...Array(8)].flatMap((_, k) => [...leg(80 + k * 12, 95 + k * 12, 4), ...leg(95 + k * 12, 92 + k * 12, 2)]),
]);

describe("the market's bull market", () => {
  it("starts at the market's low before its monthly chart turned up", () => {
    expect(marketBullStart(MARKET)).toBe(month(13));
  });

  it("is none while the market's monthly chart is down", () => {
    expect(marketBullStart(MARKET.slice(0, 14))).toBeNull();
  });
});

describe("a top in the first two years not exceeded for two years (A-TREND-07)", () => {
  // From the bull start (month 13): up to a top in month 19, then 26 months under it.
  const stock = (later: number[]) => months([...leg(60, 40, 13), ...leg(40, 70, 6), ...leg(70, 55, 4), ...later]);

  it("is weak", () => {
    const r = readWeakStock(stock([...leg(55, 66, 11), ...leg(66, 58, 11)]), MARKET)!;
    expect(r.bullStart).toBe(month(13));
    expect(r.earlyTopFailed).toMatchObject({ month: month(18) });
    expect(r.weak).toBe(true);
  });

  it("is not weak once a later month exceeds the top", () => {
    const r = readWeakStock(stock([...leg(55, 66, 11), ...leg(66, 72, 11)]), MARKET)!;
    expect(r.earlyTopFailed).toBeNull();
  });

  it("counts the two years from the market's bull start, not from a higher top before it", () => {
    const before = months([...leg(60, 80, 3), ...leg(80, 40, 10), ...leg(40, 70, 6), ...leg(70, 55, 4), ...leg(55, 66, 11), ...leg(66, 58, 11)]);
    expect(readWeakStock(before, MARKET)!.earlyTopFailed).toMatchObject({ month: month(18) });
  });

  it("is not called until two years have passed since the top", () => {
    expect(readWeakStock(stock(leg(55, 66, 10)), MARKET)!.earlyTopFailed).toBeNull();
  });
});

describe("a first rally of three months or less, never exceeded (A-TREND-08)", () => {
  // American Home Products: 25 to 43 3/4 in three months, back to 25, up to 36.
  const ahp = (later: number[]) => months([...leg(30, 25, 14), ...leg(25, 43.75, 3), ...leg(43.75, 25, 4), ...later]);

  it("is weak when the rally back stops short of the first rally's top", () => {
    const r = readWeakStock(ahp(leg(25, 36, 6)), MARKET)!;
    expect(r.firstRallyNotExceeded).toMatchObject({ months: 3, month: month(16) });
    expect(r.firstRallyNotExceeded!.top).toBeCloseTo(43.75 * 1.01, 8);
    expect(r.weak).toBe(true);
  });

  it("is not weak once a later month exceeds that top", () => {
    expect(readWeakStock(ahp(leg(25, 46, 6)), MARKET)!.firstRallyNotExceeded).toBeNull();
  });

  it("is not this reading when the first rally ran longer than three months", () => {
    const slow = months([...leg(30, 25, 14), ...leg(25, 43.75, 5), ...leg(43.75, 25, 4), ...leg(25, 36, 6)]);
    expect(readWeakStock(slow, MARKET)!.firstRallyNotExceeded).toBeNull();
  });
});

describe("the month in progress", () => {
  it("is built from the daily bars, so the live scan and the replay read the same chart", () => {
    const closed = months([10, 11, 12]);
    const daily: Bar[] = [1, 2, 3].map((d) => ({ t: `2019-04-0${d}T14:00:00Z`, o: 12, h: 12 + d, l: 11, c: 12 + d / 2, v: 10 }));
    const m = monthlyWithCurrent([...closed, { ...closed[2], t: "2019-04-01T05:00:00Z", h: 99 }], daily);
    expect(m).toHaveLength(4);
    expect(m[3]).toMatchObject({ h: 15, l: 11, c: 13.5, v: 30 });
  });
});

describe("on the card and in the measured context", () => {
  // The A-TREND-07 stock above, its next month in progress from daily bars.
  const monthly = months([...leg(60, 40, 13), ...leg(40, 70, 6), ...leg(70, 55, 4), ...leg(55, 66, 11), ...leg(66, 58, 11)]);
  const daily: Bar[] = Array.from({ length: 60 }, (_, i) => {
    const c = 58 + Math.sin(i / 3);
    return { t: new Date(Date.UTC(2022, 7, 1 + i, 14)).toISOString(), o: c, h: c + 0.5, l: c - 0.5, c, v: 1e6 };
  });
  const facts = { sharesOutstanding: null, inception: null, monthly, marketMonthly: MARKET };

  it("reads the stock as weak, says so, and records it for a buy", () => {
    const ctx = readDisclosedRules(daily, 58, facts, new Date("2022-09-29T20:00:00Z"));
    expect(ctx.weakStock?.weak).toBe(true);
    expect(describeDisclosedRules(ctx).some((l) => l.startsWith("Weak in this bull market:"))).toBe(true);
    expect(contextFactorsFor(ctx, "bullish", 58).weakStockLong).toBe(true);
    expect(contextFactorsFor(ctx, "bearish", 58).weakStockLong).toBeUndefined();
  });

  it("is absent without the monthly bars", () => {
    const ctx = readDisclosedRules(daily, 58, { sharesOutstanding: null, inception: null }, new Date("2022-09-29T20:00:00Z"));
    expect(ctx.weakStock ?? null).toBeNull();
  });
});

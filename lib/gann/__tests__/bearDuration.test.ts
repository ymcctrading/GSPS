/**
 * Bear-market duration (A-TIME-06, W006 p.13): bear markets have run 12 to 43
 * months, culminating near months 27, 30, 34 and 36-43; from a top, watch for
 * a bottom at months 30-36, then 40-43. Dated from the market's top before
 * its monthly chart turned down (item 7 map fork F4: the market's bear).
 * Context only.
 */
import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { marketBearStart } from "@/lib/gann/leadership";
import { readBearDuration } from "@/lib/gann/bearDuration";
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
const monthDate = (i: number) => new Date(Date.UTC(2019, i, 15));

// A rise with a two-month reaction to a top in month 11 (December 2019), then a
// decline that breaks the reaction's bottom in its third month, turning the
// monthly chart down, and runs on for 50 months.
const MARKET = months([...leg(100, 140, 8), ...leg(140, 136, 2), ...leg(136, 150, 2), ...leg(150, 130, 4), ...leg(130, 60, 46)]);
const TOP = 11;
// The chart turns down in the decline's third month; before that the bear is not yet known.
const KNOWN = 3;

describe("the market's bear market", () => {
  it("starts at the market's top before its monthly chart turned down", () => {
    expect(marketBearStart(MARKET)).toBe("2019-12");
  });

  it("is none while the market's monthly chart is up", () => {
    expect(marketBearStart(MARKET.slice(0, TOP + KNOWN))).toBeNull();
    expect(marketBearStart(MARKET.slice(0, TOP + KNOWN + 1))).toBe("2019-12");
  });
});

describe("bear-market duration from its top (A-TIME-06)", () => {
  const at = (m: number) => readBearDuration(MARKET.slice(0, TOP + m + 1), monthDate(TOP + m));

  it("flags months 30-36 and 40-43 from the top as bottom windows, and no other month", () => {
    for (let m = KNOWN; m <= 49; m++) {
      const r = at(m);
      expect(r?.months).toBe(m);
      expect(r?.inBottomWindow).toBe((m >= 30 && m <= 36) || (m >= 40 && m <= 43));
    }
  });

  it("reads months under 12 as shorter than any bear market, and past 43 as longer than the longest", () => {
    for (let m = KNOWN; m <= 49; m++) {
      expect(at(m)?.beforeShortest).toBe(m < 12);
      expect(at(m)?.pastLongest).toBe(m > 43);
    }
  });

  it("marks the culminations near months 27, 30 and 34 and through 36-43", () => {
    const near = [27, 30, 34, 36, 37, 38, 39, 40, 41, 42, 43];
    for (let m = KNOWN; m <= 49; m++) expect(at(m)?.nearCulmination).toBe(near.includes(m));
  });

  it("is none in a bull market", () => {
    expect(readBearDuration(MARKET.slice(0, TOP + 1), monthDate(TOP))).toBeNull();
  });
});

describe("on the setup", () => {
  // A stock's daily bars ending in June 2022, month 30 from the top.
  const daily: Bar[] = Array.from({ length: 80 }, (_, i) => {
    const d = new Date(Date.UTC(2022, 3, 1 + i, 5));
    const c = 50 + Math.sin(i / 4) * 3;
    return { t: d.toISOString(), o: c, h: c + 0.5, l: c - 0.5, c, v: 1e6 };
  });
  const asOf = new Date(daily[daily.length - 1].t);
  const marketMonthly = MARKET.filter((b) => b.t.slice(0, 7) < asOf.toISOString().slice(0, 7));

  it("is read on every scan from the market's monthly bars, and shown for context", () => {
    const ctx = readDisclosedRules(daily, daily[daily.length - 1].c, { sharesOutstanding: null, inception: null, marketMonthly, marketDaily: [] }, asOf);
    expect(ctx.bearDuration?.topMonth).toBe("2019-12");
    expect(ctx.bearDuration?.inBottomWindow).toBe(true);
    expect(describeDisclosedRules(ctx).some((l) => /bear market.*month/i.test(l) && /Shown for context/.test(l))).toBe(true);
    expect(contextFactorsFor(ctx, "bullish", 50).marketBearBottomWindow).toBe(true);
    expect(contextFactorsFor(ctx, "bullish", 50).marketBearYoung).toBe(false);
    expect(contextFactorsFor(ctx, "bearish", 50).marketBearBottomWindow).toBeUndefined();
  });
});

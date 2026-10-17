/**
 * A-TIME-33 (Tunnel Thru the Air, 1927, printed pp. 213, 370-372): 1,290 and
 * 1,335 days and 70 weeks (490 days) from an outbreak, here a major turn of
 * the long monthly chart (a labelled anchor). Context only.
 */
import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { OUTBREAK_DAY_COUNTS, readOutbreakCounts } from "@/lib/gann/outbreakCounts";
import { describeDisclosedRules, readDisclosedRules } from "@/lib/gann/disclosedRules";
import { contextFactorsFor } from "@/lib/gann/contextFactors";

const leg = (from: number, to: number, n: number) => Array.from({ length: n }, (_, i) => from + ((to - from) * (i + 1)) / n);
// One clear top in month 30 (July 2012) on monthly bars from February 2010.
const MONTHLY: Bar[] = [...leg(100, 200, 30), ...leg(200, 120, 50)].map((c, i) => ({
  t: new Date(Date.UTC(2010, 1 + i, 1, 5)).toISOString(),
  o: c,
  h: c * 1.01,
  l: c * 0.99,
  c,
  v: 1e8,
}));
const TOP_MONTH = MONTHLY[29].t.slice(0, 7);
const plus = (iso: string, days: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + days * 86_400_000);

describe("Daniel's counts from a major turn (A-TIME-33)", () => {
  it("are 490, 1,290 and 1,335 days", () => {
    expect([...OUTBREAK_DAY_COUNTS]).toEqual([490, 1290, 1335]);
  });

  it("lands each count in a window as wide as the pivot's month", () => {
    expect(TOP_MONTH).toBe("2012-07");
    for (const days of OUTBREAK_DAY_COUNTS) {
      const hit = readOutbreakCounts(MONTHLY, plus("2012-07-01", days));
      expect(hit.map((h) => h.days)).toEqual([days]);
      expect(hit[0].pivotKind).toBe("high");
      expect(readOutbreakCounts(MONTHLY, plus("2012-07-31", days)).map((h) => h.days)).toEqual([days]);
      expect(readOutbreakCounts(MONTHLY, plus("2012-07-31", days + 1))).toEqual([]);
      expect(readOutbreakCounts(MONTHLY, plus("2012-07-01", days - 1))).toEqual([]);
    }
  });

  it("puts 1,335 exactly 45 days after 1,290", () => {
    const a = readOutbreakCounts(MONTHLY, plus("2012-07-01", 1290))[0];
    const b = readOutbreakCounts(MONTHLY, plus("2012-07-01", 1335))[0];
    expect((Date.parse(b.from) - Date.parse(a.from)) / 86_400_000).toBe(45);
  });
});

describe("on the setup", () => {
  const asOf = plus("2012-07-10", 1290);
  const daily: Bar[] = Array.from({ length: 80 }, (_, k) => {
    const d = new Date(asOf.getTime() - (79 - k) * 86_400_000);
    const c = 50 + Math.sin(k / 4) * 3;
    return { t: d.toISOString(), o: c, h: c + 0.5, l: c - 0.5, c, v: 1e6 };
  });

  it("is read from the long monthly bars and shown for context", () => {
    const ctx = readDisclosedRules(daily, 50, { sharesOutstanding: null, inception: null, monthlyLong: MONTHLY.filter((b) => b.t < daily[0].t) }, asOf);
    expect(ctx.outbreakCounts?.map((h) => h.days)).toEqual([1290]);
    expect(describeDisclosedRules(ctx).some((l) => /1,290 days from the 2012-07 top/.test(l) && /Shown for context/.test(l))).toBe(true);
    expect(contextFactorsFor(ctx, "bullish", 50).outbreakDayCount).toBe(true);
  });
});

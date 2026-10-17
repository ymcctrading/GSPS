/**
 * A-TIME-16 (Annual Forecasts 1919-1922, W036 pp. 7, 22): the dates to watch
 * alternate high and low, and "if low prices are made on the date indicated,
 * you may expect high prices at the next date". A listed date marks some rally
 * or decline, not always the extreme. Context only.
 */
import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { labelChangeDates, readTiming } from "@/lib/gann/timeConvergence";
import { describeDisclosedRules, readDisclosedRules } from "@/lib/gann/disclosedRules";
import { contextFactorsFor } from "@/lib/gann/contextFactors";

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 0, 5, 15);
/** One bar a calendar day from closes; each bar spans 1 around its close. */
const bars = (closes: number[]): Bar[] =>
  closes.map((c, i) => ({ t: new Date(T0 + i * DAY).toISOString(), o: c, h: c + 1, l: c - 1, c, v: 1000 }));

describe("change dates alternate high and low (A-TIME-16)", () => {
  it("labels the dates from a bottom high, low, high", () => {
    const b = bars(Array.from({ length: 5 }, (_, i) => 100 + i));
    const r = labelChangeDates(b, 0, "bottom");
    expect(r.dates.map((d) => [d.days, d.expect])).toEqual([[7, "high"], [14, "low"], [21, "high"]]);
    expect(r.next?.days).toBe(7);
    expect(r.next?.expect).toBe("high");
  });

  it("expects a high at the next date when a low prints on a high date", () => {
    // From the bottom on day 0, day 7 is a high date; price makes a low there instead.
    const closes = [100, 103, 106, 108, 107, 105, 103, 101, 103, 105, 106];
    const b = bars(closes);
    const r = labelChangeDates(b, 0, "bottom");
    expect(r.dates[0]).toMatchObject({ days: 7, expect: "high", came: "low" });
    // Day 14 was a low date; after the miss it is labelled an expected high.
    expect(r.next).toMatchObject({ days: 14, expect: "high" });
  });

  it("keeps the alternation when a date comes in as listed", () => {
    const closes = [100, 102, 104, 106, 107, 108, 109, 112, 109, 107, 106];
    const r = labelChangeDates(bars(closes), 0, "bottom");
    expect(r.dates[0]).toMatchObject({ days: 7, expect: "high", came: "high" });
    expect(r.next).toMatchObject({ days: 14, expect: "low" });
  });

  it("leaves a date that marked no turn unlabelled and the alternation as listed", () => {
    const closes = Array.from({ length: 11 }, (_, i) => 100 + i);
    const r = labelChangeDates(bars(closes), 0, "bottom");
    expect(r.dates[0].came).toBeNull();
    expect(r.next).toMatchObject({ days: 14, expect: "low" });
  });

  it("is read from the last swing pivot on every scan, and shown for context", () => {
    const closes = Array.from({ length: 80 }, (_, i) => 100 + 10 * Math.sin(i / 5));
    const b = bars(closes);
    expect(readTiming(b).changeDates).not.toBeNull();
    const ctx = readDisclosedRules(b, b[b.length - 1].c, null, new Date(b[b.length - 1].t));
    const next = ctx.timing.changeDates?.next;
    expect(next).toBeTruthy();
    expect(describeDisclosedRules(ctx).some((l) => /change date/.test(l) && /Shown for context/.test(l))).toBe(true);
    expect(contextFactorsFor(ctx, "bullish", 100).nextChangeDateExpectsHigh).toBe(next!.expect === "high");
  });
});

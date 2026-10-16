/**
 * A-TIME-32 (Tunnel Thru the Air, 1927, printed pp. 371-374, PDF 376-379):
 * fixed counts of years and months from a founding date. Pre-registered list,
 * no search. Context only.
 */
import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { FOUNDING_COUNT_YEARS, readFoundingCounts } from "@/lib/gann/incorporationCycle";
import { describeDisclosedRules, readDisclosedRules } from "@/lib/gann/disclosedRules";
import { contextFactorsFor } from "@/lib/gann/contextFactors";

const on = (iso: string) => new Date(`${iso}T12:00:00Z`);

describe("fixed counts from a founding date (A-TIME-32)", () => {
  it("is the book's pre-registered list", () => {
    expect([...FOUNDING_COUNT_YEARS]).toEqual([7, 14, 20, 49, 70, 140, 343, 490]);
  });

  it("reproduces the book's own sums: 1776 + 140 = 1916 and 1914 + 14 = 1928", () => {
    expect(readFoundingCounts({ date: "1776-07-04", precision: "day" }, on("1916-11-07"))?.years).toContain(140);
    expect(readFoundingCounts({ date: "1914-08-01", precision: "day" }, on("1928-05-01"))?.years).toContain(14);
    expect(readFoundingCounts({ date: "1585-01-01", precision: "year" }, on("1928-01-01"))?.years).toContain(343);
  });

  it("counts multiples of 49 (1783 + 3 x 49 = 1930, 1614 + 6 x 49 = 1908)", () => {
    expect(readFoundingCounts({ date: "1783-11-25", precision: "day" }, on("1930-06-01"))?.years).toEqual([147]);
    expect(readFoundingCounts({ date: "1614-01-01", precision: "year" }, on("1908-06-01"))?.years).toEqual([294]);
  });

  it("counts 42 months (half a seven) when the month is known", () => {
    expect(readFoundingCounts({ date: "1914-08-01", precision: "month" }, on("1918-02-15"))?.months42).toBe(true);
    expect(readFoundingCounts({ date: "1914-08-01", precision: "month" }, on("1918-03-15"))?.months42).toBe(false);
    expect(readFoundingCounts({ date: "1914-01-01", precision: "year" }, on("1917-07-15"))?.months42).toBe(false);
  });

  it("is quiet on a year no count lands on", () => {
    const r = readFoundingCounts({ date: "1901-02-25", precision: "day" }, on("1932-02-25"));
    expect(r?.years).toEqual([]);
    expect(readFoundingCounts(null, on("1932-02-25"))).toBeNull();
  });
});

describe("on the setup", () => {
  const daily: Bar[] = Array.from({ length: 80 }, (_, k) => {
    const d = new Date(Date.UTC(2026, 3, 1 + k, 5));
    const c = 50 + Math.sin(k / 4) * 3;
    return { t: d.toISOString(), o: c, h: c + 0.5, l: c - 0.5, c, v: 1e6 };
  });
  const asOf = new Date(daily[daily.length - 1].t);

  it("is read from the stored inception date and shown for context", () => {
    const ctx = readDisclosedRules(daily, 50, { sharesOutstanding: null, inception: { date: "1977-03-10", precision: "day" } }, asOf);
    expect(ctx.foundingCounts?.years).toEqual([49]);
    expect(describeDisclosedRules(ctx).some((l) => /49 years from the company's founding/.test(l) && /Shown for context/.test(l))).toBe(true);
    expect(contextFactorsFor(ctx, "bullish", 50).foundingCountYear).toBe(true);
    expect(contextFactorsFor(ctx, "bearish", 50).foundingCount42Months).toBe(false);
  });
});

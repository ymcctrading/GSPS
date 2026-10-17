/**
 * The class C long month counts (C-TIME-09's 144 months, item 7 second review
 * M-b): the live scan fetches `LONG_MONTHLY_YEARS` of monthly bars and hands
 * them only to those counts, every other reading keeping its ten years; the
 * replay caps each session at the same span.
 */
import { describe, expect, it, vi } from "vitest";
import type { Bar } from "@/lib/types";

const starts = vi.hoisted(() => ({ monthly: [] as number[] }));
const longBars = vi.hoisted(() => [] as Bar[]);
vi.mock("@/lib/data/synthetic", async () => {
  const actual = await vi.importActual<typeof import("@/lib/data/synthetic")>("@/lib/data/synthetic");
  const fetchBars = async (_s: string, timeframe: string, start: Date) => {
    if (timeframe === "1Month") {
      starts.monthly.push(start.getTime());
      return longBars;
    }
    return [];
  };
  const fetchBarsBatch = async (symbols: string[], timeframe: string, start: Date) => {
    if (timeframe === "1Month") starts.monthly.push(start.getTime());
    return new Map(symbols.map((s) => [s.toUpperCase(), timeframe === "1Month" ? longBars : []]));
  };
  return { ...actual, syntheticProvider: { ...actual.syntheticProvider, isLive: false, fetchBars, fetchBarsBatch } };
});
vi.stubEnv("MARKET_DATA_PROVIDER", "synthetic");

const { fetchAllTimeframes, fetchAllTimeframesBatch } = await import("@/lib/data/provider");
const { LONG_MONTHLY_YEARS, YEAR_COUNT_MONTHLY_YEARS, longMonthlyWindow, readSecondaryMonthCounts } = await import("@/lib/gann/secondaryTime");
const { readDisclosedRules } = await import("@/lib/gann/disclosedRules");

const YEAR = 365.25 * 86_400_000;
const now = Date.now();
const monthStart = (i: number) => new Date(Date.UTC(new Date(now).getUTCFullYear() - 14, i, 1)).toISOString();
longBars.push(...Array.from({ length: 14 * 12 + 1 }, (_, i) => ({ t: monthStart(i), o: 100, h: 101, l: 99, c: 100, v: 1 })));

describe("the live fetch", () => {
  it("reaches the long span and keeps ten years for every other reading, single and batched", async () => {
    for (const read of [() => fetchAllTimeframes("TEST", "us_equity"), async () => (await fetchAllTimeframesBatch(["TEST"])).get("TEST")!]) {
      starts.monthly.length = 0;
      const r = await read();
      expect(Math.abs(starts.monthly[0] - (now - YEAR_COUNT_MONTHLY_YEARS * YEAR))).toBeLessThan(5 * 86_400_000);
      expect(r.monthlyYearCount).toEqual(longBars);
      expect(r.monthlyLong).toEqual(longMonthlyWindow(longBars, new Date(now)));
      expect(r.monthlyLong!.length).toBeLessThan(longBars.length);
      expect(r.monthly.length).toBeGreaterThan(0);
      expect(r.monthly.every((b) => Date.parse(b.t) >= now - 10 * YEAR - 86_400_000)).toBe(true);
      expect(r.monthly).toEqual(longBars.filter((b) => Date.parse(b.t) >= Date.parse(r.monthly[0].t)));
    }
  });
});

describe("the long month counts", () => {
  // A V pivoting 144 months before the session (Jan 2014 to Jan 2026).
  const v: Bar[] = Array.from({ length: 168 }, (_, i) => {
    const c = 100 + Math.abs(i - 24) * 1.5;
    return { t: new Date(Date.UTC(2012, i, 1)).toISOString(), o: c, h: c + 1, l: c - 1, c, v: 1 };
  });
  const asOf = new Date(Date.UTC(2026, 0, 15));
  const daily: Bar[] = Array.from({ length: 40 }, (_, i) => ({ t: new Date(Date.UTC(2025, 11, 7 + i)).toISOString(), o: 100, h: 101, l: 99, c: 100, v: 1 }));

  it("see a 144-month pivot from the long series and not from ten years", () => {
    const facts = { sharesOutstanding: null, inception: null, monthly: v.filter((b) => b.t >= "2016-01") };
    expect(readDisclosedRules(daily, 100, { ...facts, monthlyLong: v }, asOf).secondaryTime?.monthCounts?.map((h) => h.count)).toContain(144);
    expect(readDisclosedRules(daily, 100, facts, asOf).secondaryTime?.monthCounts?.map((h) => h.count) ?? []).not.toContain(144);
  });

  it("are capped at the long span before each session in the replay", () => {
    const w = longMonthlyWindow(v, asOf);
    expect(w[0].t.slice(0, 7)).toBe(`${2026 - LONG_MONTHLY_YEARS}-01`);
    expect(readSecondaryMonthCounts(w, asOf).map((h) => h.count)).toContain(144);
    // Fourteen years on, the same pivot has left the window.
    expect(longMonthlyWindow(v, new Date(Date.UTC(2028, 0, 15)))[0].t.slice(0, 7)).toBe(`${2028 - LONG_MONTHLY_YEARS}-01`);
  });
});

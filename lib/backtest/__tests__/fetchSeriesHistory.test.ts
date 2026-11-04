/**
 * `fetchSeries`'s fixed history window (quant validation): the execution and
 * daily requests start at `history.from`, every request ends at `history.to`,
 * the bar cap grows with the span, and without a window nothing changes.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => [] as Array<{ timeframe: string; start: Date; end: Date | null; limit?: number }>);
vi.mock("@/lib/data/provider", async () => {
  const actual = await vi.importActual<typeof import("@/lib/data/provider")>("@/lib/data/provider");
  const fetchBars = async (_symbol: string, timeframe: string, start: Date, end: Date | null, _ac: string, limit?: number) => {
    calls.push({ timeframe, start, end, limit });
    return [];
  };
  return { ...actual, getMarketDataProvider: () => ({ ...actual.getMarketDataProvider(), fetchBars }) };
});

import { fetchSeries } from "@/lib/backtest/run";
import { TF_MAX_BARS } from "@/lib/timeframe";

describe("fetchSeries history window", () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it("starts the daily requests at the window, ends every request at it, and widens the cap", async () => {
    const from = new Date("2015-01-01T00:00:00Z");
    const to = new Date("2020-11-01T00:00:00Z");
    await fetchSeries("AAA", "1Day", true, undefined, { from, to });
    expect(calls).toHaveLength(4);
    for (const c of calls) expect(c.end).toEqual(to);
    const daily = calls.filter((c) => c.timeframe === "1Day");
    expect(daily).toHaveLength(2);
    for (const c of daily) {
      expect(c.start).toEqual(from);
      // 2,131 days of a 2,190-day lookback's 1,600-bar cap, plus headroom.
      expect(c.limit).toBeGreaterThanOrEqual(TF_MAX_BARS["1Day"]);
    }
    const monthly = calls.find((c) => c.timeframe === "1Month")!;
    expect(monthly.start.getTime()).toBeLessThan(from.getTime());
  });

  it("is unchanged without a window: no end, the usual caps", async () => {
    await fetchSeries("AAA", "1Day", true);
    for (const c of calls) expect(c.end).toBeNull();
    for (const c of calls.filter((x) => x.timeframe === "1Day")) expect(c.limit).toBe(TF_MAX_BARS["1Day"]);
    expect(calls.find((c) => c.timeframe === "1Week")!.limit).toBe(TF_MAX_BARS["1Week"]);
  });

  it("refuses a window that ends before it starts", async () => {
    await expect(fetchSeries("AAA", "1Day", false, undefined, { from: new Date("2020-01-01"), to: new Date("2016-01-01") })).rejects.toThrow();
  });
});

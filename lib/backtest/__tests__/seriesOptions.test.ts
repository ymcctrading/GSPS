/**
 * The bars a replay is handed come from one helper, so the 12-symbol route
 * (collectRun) and the 766-symbol runner (scripts/backtest-universe.mjs) read
 * the same series (item 7e review M1: the runner dropped the long monthly and
 * the market's monthly, so the class C long counts and the bear-market
 * duration were never measured on the run that gets reported).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { replaySeriesOptions } from "@/lib/backtest/run";

const bar = (t: string): Bar => ({ t, o: 1, h: 1, l: 1, c: 1, v: 1 });

describe("replay series options", () => {
  it("hands the replay the symbol's daily, monthly and long monthly bars and the market's daily and monthly bars", () => {
    const daily = [bar("2026-01-02T00:00:00Z")];
    const monthly = [bar("2020-01-01T00:00:00Z")];
    const monthlyLong = [bar("2014-01-01T00:00:00Z"), ...monthly];
    const marketDaily = [bar("2026-01-03T00:00:00Z")];
    const marketMonthly = [bar("2019-01-01T00:00:00Z")];
    const o = replaySeriesOptions({ bars: [], daily, monthly, monthlyLong }, { bars: [], daily: marketDaily, monthly: marketMonthly });
    expect(o).toEqual({ dailyBars: daily, monthlyBars: monthly, longMonthlyBars: monthlyLong, marketDailyBars: marketDaily, marketMonthlyBars: marketMonthly });
  });

  it("leaves the market's series out when SPY could not be fetched", () => {
    const o = replaySeriesOptions({ bars: [], daily: [] }, undefined);
    expect(o.marketDailyBars).toBeUndefined();
    expect(o.marketMonthlyBars).toBeUndefined();
  });

  it("is what the universe runner passes to every replay", () => {
    const src = readFileSync(path.resolve(__dirname, "../../../scripts/backtest-universe.mjs"), "utf8");
    expect(src).toMatch(/replay\(symbol, bars, \{.*\.\.\.run\.replaySeriesOptions\(series, market\)/);
    expect(src).toMatch(/market = await run\.fetchSeries\("SPY", args\.timeframe, true\)/);
  });
});

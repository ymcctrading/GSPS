import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { parseScript } from "@/lib/strategies/custom/parser";
import { computeScriptPlotSeries } from "@/lib/strategies/custom/plot";
import { sma, ema } from "@/lib/strategies/math";

function bar(o: number, h: number, l: number, c: number, v = 1000): Bar {
  return { t: "2026-01-01T00:00:00Z", o, h, l, c, v } as Bar;
}

function trendBars(n: number): Bar[] {
  const bars: Bar[] = [];
  let p = 100;
  for (let i = 0; i < n; i++) {
    p += i % 3 === 0 ? -0.7 : 1.1;
    bars.push(bar(p - 0.5, p + 1, p - 1, p));
  }
  return bars;
}

const SOURCE = `
  rule bullish when crossesAbove(ema(9), sma(20)) {
    entry = high[0] * 1.0005
    stop = lowest(low, 10)
  }
  rule bearish when crossesBelow(ema(9), sma(20)) {
    entry = low[0] * 0.9995
    stop = highest(high, 10)
  }
`;

describe("computeScriptPlotSeries", () => {
  it("extracts one series per distinct indicator/extreme reference, deduped across rules", () => {
    const ast = parseScript(SOURCE);
    const bars = trendBars(40);
    const series = computeScriptPlotSeries(ast, bars);

    const labels = series.map((s) => s.label).sort();
    expect(labels).toEqual(["ema(9)", "highest(high,10)", "lowest(low,10)", "sma(20)"]);
  });

  it("matches the underlying math.ts series exactly (full, unshifted line)", () => {
    const ast = parseScript(SOURCE);
    const bars = trendBars(40);
    const series = computeScriptPlotSeries(ast, bars);

    const emaSeries = series.find((s) => s.label === "ema(9)")!;
    const smaSeries = series.find((s) => s.label === "sma(20)")!;
    expect(emaSeries.points).toEqual(ema(bars, 9));
    expect(smaSeries.points).toEqual(sma(bars, 20));
  });

  it("does not plot bare bar series or numeric literals", () => {
    const ast = parseScript(`
      rule bullish when close[0] > open[0] {
        entry = close[0] + 1
        stop = low[0]
      }
    `);
    const series = computeScriptPlotSeries(ast, trendBars(10));
    expect(series).toEqual([]);
  });

  it("dedupes an indicator referenced at multiple offsets into one unshifted line", () => {
    const ast = parseScript(`
      rule bullish when ema(9)[1] < ema(9)[0] {
        entry = close[0]
        stop = low[0]
      }
    `);
    const bars = trendBars(20);
    const series = computeScriptPlotSeries(ast, bars);
    expect(series).toHaveLength(1);
    expect(series[0].label).toBe("ema(9)");
    expect(series[0].points).toEqual(ema(bars, 9));
  });

  it("returns an empty list for a script with no indicator/extreme references", () => {
    const ast = parseScript(`rule bullish when close[0] > 0 { entry = close[0] stop = low[0] }`);
    expect(computeScriptPlotSeries(ast, trendBars(5))).toEqual([]);
  });
});

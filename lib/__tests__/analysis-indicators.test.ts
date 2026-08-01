import { describe, it, expect } from "vitest";
import { calculateMACD, calculateRSI } from "@/lib/analysis/indicators";
import { syntheticProvider } from "@/lib/data/synthetic";
import { TF_LOOKBACK_DAYS, TF_MAX_BARS, parseTimeframe } from "@/lib/timeframe";

/**
 * Regression coverage for the /api/indicators pipeline (provider.fetchBars →
 * calculateMACD/calculateRSI). This route previously 502'd on every request:
 * it called `fetchBars(symbol, timeframe, assetClass)` against a 5-6 argument
 * signature — passing the asset class where the start date belongs — and its
 * `"5m"`-style timeframe strings matched no known `Timeframe`, so
 * `TF_LOOKBACK_DAYS[timeframe]` was `undefined` and the resulting `start` date
 * was `Invalid Date`. Exercising the exact call shape the route makes (without
 * spinning up a Next request) catches both failure modes without depending on
 * Next's route-handler internals.
 */
describe("/api/indicators pipeline", () => {
  it("resolves shorthand timeframes and fetches bars the indicators can use", async () => {
    for (const raw of ["5m", "1h", "1d"]) {
      const timeframe = parseTimeframe(raw, "5Min");
      const start = new Date(Date.now() - TF_LOOKBACK_DAYS[timeframe] * 24 * 3600 * 1000);
      expect(Number.isNaN(start.getTime())).toBe(false);

      const bars = await syntheticProvider.fetchBars(
        "AAPL",
        timeframe,
        start,
        null,
        "us_equity",
        TF_MAX_BARS[timeframe],
      );
      expect(bars.length).toBeGreaterThan(35); // enough for MACD's slow(26)+signal(9) warm-up

      const closes = bars.map((b) => b.c);
      const timestamps = bars.map((b) => new Date(b.t).getTime() / 1000);
      const macd = calculateMACD(closes, timestamps);
      const rsi = calculateRSI(closes, timestamps);
      expect(macd.length).toBeGreaterThan(0);
      expect(rsi.length).toBeGreaterThan(0);
    }
  });

  it("falls back to a real timeframe instead of producing an invalid date for junk input", () => {
    const timeframe = parseTimeframe("not-a-timeframe", "5Min");
    expect(timeframe).toBe("5Min");
    const start = new Date(Date.now() - TF_LOOKBACK_DAYS[timeframe] * 24 * 3600 * 1000);
    expect(Number.isNaN(start.getTime())).toBe(false);
  });
});

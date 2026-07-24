/**
 * GSPS scan pipeline — the top-down flow from the Premise doc:
 *   10yr/5yr/1yr trend + S/R  →  1hr refinement  →  15min sniper entry
 * with Gann confluence (fans, Square of 9, time cycles) and Sara Sniper Strat
 * execution mechanics, producing entry / SL / TP1 / master profit + score /9.
 */

import type { AssetClass, GannLevels, ScanResult, StratPattern } from "@/lib/types";
import { isCryptoSymbol } from "@/lib/data/alpaca";
import { fetchAllTimeframes, getMarketDataProvider } from "@/lib/data/provider";
import { readTrend } from "@/lib/analysis/trend";
import { atr } from "@/lib/analysis/pivots";
import { computeFanLines } from "@/lib/gann/fans";
import { squareOf9Levels } from "@/lib/gann/squareOf9";
import { timeCycles } from "@/lib/gann/timeCycles";
import { detectPatterns, gapRuleViolated } from "@/lib/strat/patterns";
import { computeTradeLevels } from "@/lib/strat/levels";
import { computeScore } from "@/lib/scoring/score";

export async function scanTicker(symbol: string, optionPremium?: number): Promise<ScanResult> {
  const assetClass: AssetClass = isCryptoSymbol(symbol) ? "crypto" : "us_equity";
  const scannedAt = new Date().toISOString();

  try {
    const provider = getMarketDataProvider();
    const [{ monthly, weekly, daily, hourly, m15 }, currentPrice] = await Promise.all([
      fetchAllTimeframes(symbol, assetClass),
      provider.fetchLatestPrice(symbol, assetClass),
    ]);

    if (daily.length < 30 || m15.length < 10) {
      throw new Error(`Insufficient bar data for ${symbol}`);
    }

    // ---- Level 1: macro trends + S/R (10yr monthly, 5yr weekly, 1yr daily)
    const monthlyTrend = readTrend(monthly, "1Month");
    const weeklyTrend = readTrend(weekly, "1Week");
    const dailyTrend = readTrend(daily, "1Day");

    // ---- Level 2: 1hr refinement
    const hourlyTrend = readTrend(hourly, "1Hour");

    // ---- Gann structures (anchored on the daily chart)
    const fanLines = computeFanLines(daily, currentPrice);
    const majorLow = Math.min(...daily.map((b) => b.l));
    const s9 = squareOf9Levels(majorLow, currentPrice).slice(0, 12);
    const cycles = timeCycles(daily);

    const gann: GannLevels = {
      fanLines: fanLines.slice(0, 6).map(({ angle, price, distancePct }) => ({
        angle,
        price: Math.round(price * 100) / 100,
        distancePct,
      })),
      squareOf9: s9.slice(0, 6).map(({ degree, price, distancePct }) => ({
        degree,
        price: Math.round(price * 100) / 100,
        distancePct,
      })),
      timeCycleActive: cycles.active,
      timeCycleDates: cycles.dates,
    };

    // ---- Level 3: 15min sniper entry via Strat patterns (closed bars only)
    const closedM15 = m15.slice(0, -1); // treat the final bar as potentially live
    const armed = detectPatterns(closedM15).filter((p) => !gapRuleViolated(p, currentPrice));

    // Prefer the pattern aligned with a reversion of the macro move; then by
    // trigger proximity to current price.
    const macroDir =
      [monthlyTrend, weeklyTrend, dailyTrend].filter((t) => t.direction === "bearish").length >= 2
        ? "bearish"
        : "bullish";
    const reversionDirection = macroDir === "bearish" ? "bullish" : "bearish";

    const pattern: StratPattern | null =
      armed
        .sort((a, b) => {
          const aRev = a.direction === reversionDirection ? 0 : 1;
          const bRev = b.direction === reversionDirection ? 0 : 1;
          if (aRev !== bRev) return aRev - bRev;
          return (
            Math.abs(a.triggerPrice - currentPrice) - Math.abs(b.triggerPrice - currentPrice)
          );
        })[0] ?? null;

    const direction: "bullish" | "bearish" | "none" = pattern?.direction ?? "none";
    const scoreDirection = pattern?.direction ?? reversionDirection;

    // ---- Trade levels
    const previousBar = closedM15[closedM15.length - 2] ?? closedM15[closedM15.length - 1];
    const gannTargets = [
      ...gann.fanLines.map((f) => f.price),
      ...gann.squareOf9.map((s) => s.price),
    ];
    const levels = pattern
      ? computeTradeLevels(pattern, previousBar, gannTargets, optionPremium)
      : null;

    // ---- Supporting signals
    const allLevels = [
      ...dailyTrend.support, ...dailyTrend.resistance,
      ...weeklyTrend.support, ...weeklyTrend.resistance,
      ...monthlyTrend.support, ...monthlyTrend.resistance,
    ];
    const nearSupportResistance = allLevels.some(
      (l) => Math.abs(currentPrice - l) / currentPrice <= 0.015,
    );

    const recentAtr = atr(daily.slice(-20), 14);
    const baselineAtr = atr(daily.slice(-100, -20), 14);
    const momentumElevated = baselineAtr > 0 && recentAtr / baselineAtr >= 1.2;

    // Earnings calendar requires a corporate-actions data subscription; null =
    // unknown (no point awarded, surfaced in the breakdown).
    const earningsSoon = assetClass === "crypto" ? false : null;

    const decision = computeScore({
      direction: scoreDirection,
      macroTrends: [monthlyTrend, weeklyTrend, dailyTrend],
      hourlyTrend,
      gann,
      nearSupportResistance,
      pattern,
      momentumElevated,
      earningsSoon,
      levels,
    });

    return {
      symbol: symbol.toUpperCase(),
      assetClass,
      scannedAt,
      currentPrice,
      direction,
      trends: [monthlyTrend, weeklyTrend, dailyTrend, hourlyTrend],
      gann,
      pattern,
      levels,
      decision,
      optionPremium,
    };
  } catch (err) {
    return {
      symbol: symbol.toUpperCase(),
      assetClass,
      scannedAt,
      currentPrice: 0,
      direction: "none",
      trends: [],
      gann: { fanLines: [], squareOf9: [], timeCycleActive: false, timeCycleDates: [] },
      pattern: null,
      levels: null,
      decision: {
        score: 0,
        outputState: "Reject",
        breakdown: [],
      },
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

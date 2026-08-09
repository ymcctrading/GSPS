/**
 * GSPS scan pipeline — the top-down flow from the Premise doc:
 *   10yr/5yr/1yr trend + S/R  →  1hr refinement  →  15min precision entry
 * with structural confluence (fans, harmonic levels, time cycles) and reversal-pattern
 * execution mechanics, producing entry / SL / TP1 / master profit + score /9.
 */

import type {
  AssetClass,
  GannLevels,
  ScanResult,
  SetupKind,
  StratPattern,
  TradeLevels,
} from "@/lib/types";
import { isCryptoSymbol } from "@/lib/data/alpaca";
import { describeDataError } from "@/lib/data/http";
import { fetchAllTimeframes, getMarketDataProvider } from "@/lib/data/provider";
import { readTrend } from "@/lib/analysis/trend";
import { atr } from "@/lib/analysis/pivots";
import { computeFanLines } from "@/lib/gann/fans";
import { squareOf9Levels } from "@/lib/gann/squareOf9";
import { timeCycles } from "@/lib/gann/timeCycles";
import {
  CONTINUATION_PATTERNS,
  detectPatterns,
  gapRuleViolated,
  riskFloorViolated,
} from "@/lib/strat/patterns";
import { computeTradeLevels } from "@/lib/strat/levels";
import { applyReversionConfirmation, computeScore } from "@/lib/scoring/score";

/**
 * What the caller is looking for. Left unset, a scan hunts reversions and
 * prefers the armed pattern that trades against the macro move — the protocol's
 * default. The market scan sets it when it is deliberately looking for a
 * momentum continuation instead, so the pattern chosen, the trade plan priced
 * from it, and the macro criterion it is scored on all describe the same trade.
 */
export interface ScanPreference {
  direction: "bullish" | "bearish";
  kind: SetupKind;
}

export async function scanTicker(
  symbol: string,
  optionPremium?: number,
  preference?: ScanPreference,
): Promise<ScanResult> {
  const assetClass: AssetClass = isCryptoSymbol(symbol) ? "crypto" : "us_equity";
  const scannedAt = new Date().toISOString();
  const setupKind: SetupKind = preference?.kind ?? "reversion";

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

    // ---- Level 3: 15min precision entry via reversal patterns (closed bars only)
    const closedM15 = m15.slice(0, -1); // treat the final bar as potentially live
    // The execution-timeframe ATR sets the noise floor a setup's stop has to
    // clear; without it a narrow bar arms a pattern no one could actually hold.
    const executionAtr = atr(closedM15.slice(-30), 14);
    const armed = detectPatterns(closedM15).filter(
      (p) => !gapRuleViolated(p, currentPrice) && !riskFloorViolated(p, executionAtr),
    );

    // Prefer the pattern aligned with a reversion of the macro move; then by
    // trigger proximity to current price. A caller hunting a continuation
    // supplies its own direction instead — the trend's, not the reversion of it.
    const macroDir =
      [monthlyTrend, weeklyTrend, dailyTrend].filter((t) => t.direction === "bearish").length >= 2
        ? "bearish"
        : "bullish";
    const reversionDirection = macroDir === "bearish" ? "bullish" : "bearish";
    const preferredDirection = preference?.direction ?? reversionDirection;

    // Three-bar compound setups carry more context than a bare 2-2 (which arms
    // on almost every directional bar), so rank them ahead of it.
    const specificity = (name: StratPattern["name"]): number => {
      switch (name) {
        case "2-1-2":
        case "3-1-2":
        case "1-2-2":
        case "3-2-2":
          return 0;
        case "PMG":
          return 1;
        case "2-2":
          return 2;
      }
    };

    // A continuation is carried by the compound patterns that break in the
    // direction of the bar sequence; the 2-2 family reverses it. Within the
    // preferred direction, rank the continuation shapes first when that is what
    // was asked for, so the trade plan priced below is the continuation's.
    const kindRank = (p: StratPattern): number =>
      setupKind === "continuation" && !CONTINUATION_PATTERNS.has(p.name) ? 1 : 0;

    const armedPatterns = [...armed].sort((a, b) => {
      const aRev = a.direction === preferredDirection ? 0 : 1;
      const bRev = b.direction === preferredDirection ? 0 : 1;
      if (aRev !== bRev) return aRev - bRev;
      const kind = kindRank(a) - kindRank(b);
      if (kind !== 0) return kind;
      const spec = specificity(a.name) - specificity(b.name);
      if (spec !== 0) return spec;
      return Math.abs(a.triggerPrice - currentPrice) - Math.abs(b.triggerPrice - currentPrice);
    });

    const pattern: StratPattern | null = armedPatterns[0] ?? null;

    const direction: "bullish" | "bearish" | "none" = pattern?.direction ?? "none";
    const scoreDirection = pattern?.direction ?? preferredDirection;

    // ---- Trade levels
    const previousBar = closedM15[closedM15.length - 2] ?? closedM15[closedM15.length - 1];
    const gannTargets = [
      ...gann.fanLines.map((f) => f.price),
      ...gann.squareOf9.map((s) => s.price),
    ];
    // A trade-plan failure is confined to the trade plan. The rest of the scan
    // — price, trends, structural levels, checklist — is still valid and worth
    // showing, so it degrades to "no levels" with a note instead of collapsing
    // the whole scan into an error and leaving the ticker page blank.
    let levels: TradeLevels | null = null;
    let levelsError: string | undefined;
    if (pattern) {
      try {
        levels = computeTradeLevels(
          pattern,
          previousBar,
          gannTargets,
          optionPremium,
          executionAtr,
          assetClass,
        );
      } catch (err) {
        levelsError = err instanceof Error ? err.message : String(err);
      }
    }

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

    // Volume sufficiency: recent average vs. longer baseline. Low-volume stocks
    // are only acceptable if momentum (volatility) is elevated.
    const recentVolumes = daily.slice(-20).map((b) => b.v);
    const recentAvgVolume = recentVolumes.length > 0
      ? recentVolumes.reduce((sum, v) => sum + v, 0) / recentVolumes.length
      : 0;
    const baselineVolumes = daily.slice(-100, -20).map((b) => b.v);
    const baselineAvgVolume = baselineVolumes.length > 0
      ? baselineVolumes.reduce((sum, v) => sum + v, 0) / baselineVolumes.length
      : 0;
    const volumeRatio = baselineAvgVolume > 0 ? recentAvgVolume / baselineAvgVolume : 1.0;

    const decision = applyReversionConfirmation(
      computeScore({
        direction: scoreDirection,
        macroTrends: [monthlyTrend, weeklyTrend, dailyTrend],
        hourlyTrend,
        gann,
        nearSupportResistance,
        pattern,
        momentumElevated,
        levels,
        setupKind,
        volumeRatio,
      }),
      pattern,
      momentumElevated,
      nearSupportResistance,
    );

    return {
      symbol: symbol.toUpperCase(),
      assetClass,
      scannedAt,
      currentPrice,
      direction,
      setupKind,
      momentumElevated,
      trends: [monthlyTrend, weeklyTrend, dailyTrend, hourlyTrend],
      gann,
      pattern,
      armedPatterns,
      levels,
      levelsError,
      decision,
      optionPremium,
    };
  } catch (err) {
    // Provider failures get user-facing wording and a code the UI can act on;
    // a rate limit is a "try again in a second", not "this symbol is broken".
    const view = describeDataError(err);
    return {
      symbol: symbol.toUpperCase(),
      assetClass,
      scannedAt,
      currentPrice: 0,
      direction: "none",
      setupKind,
      momentumElevated: false,
      trends: [],
      gann: { fanLines: [], squareOf9: [], timeCycleActive: false, timeCycleDates: [] },
      pattern: null,
      armedPatterns: [],
      levels: null,
      decision: {
        score: 0,
        outputState: "Reject",
        breakdown: [],
      },
      error: view.message,
      errorCode: view.code,
    };
  }
}

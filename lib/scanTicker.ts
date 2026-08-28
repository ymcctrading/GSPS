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
  Timeframe,
  TradeLevels,
} from "@/lib/types";
import { isCryptoSymbol } from "@/lib/data/alpaca";
import { describeDataError } from "@/lib/data/http";
import {
  type AllTimeframeBars,
  fetchAllTimeframes,
  getMarketDataProvider,
} from "@/lib/data/provider";
import { readTrend } from "@/lib/analysis/trend";
import { atr } from "@/lib/analysis/pivots";
import { levelRole } from "@/lib/analysis/levelRole";
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
import { isLargeCapStock } from "@/lib/strat/large-cap";
import { applyDataLagHold, applyReversionConfirmation, computeScore } from "@/lib/scoring/score";
import { decisionLag, feedDelayMs } from "@/lib/data/latency";
import { marketSession } from "@/lib/market/session";
import {
  FALLBACK_SR_PCT,
  SR_PROXIMITY_ATR,
  atrPercentOfPrice,
  nearestLevelMatch,
  proximityBandPct,
} from "@/lib/scoring/proximity";
import { getActiveCriterionWeights } from "@/lib/scoring/active-weights";
import { meetsLiquidityFloor, readLiquidity } from "@/lib/scan/liquidity";
import { isBinaryEventInHoldPeriod } from "@/lib/macro/earnings";
import { classifyRegime } from "@/lib/signals/regime";
import { evaluateTrendPullback } from "@/lib/signals/states/trendPullback";
import { evaluateTrendBreakout } from "@/lib/signals/states/trendBreakout";
import { buildScanMarketGates } from "@/lib/signals/scanGates";
import type { SignalVerdict } from "@/lib/signals/types";

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

/**
 * The timeframe precision entries are detected on. Named here because the feed
 * delay only means something measured against it — 15 minutes is a whole candle
 * on this timeframe and 6% of one on a 4-hour chart.
 */
const EXECUTION_TIMEFRAME: Timeframe = "15Min";

export async function scanTicker(
  symbol: string,
  optionPremium?: number,
  preference?: ScanPreference,
  /**
   * Bars already fetched by the caller (e.g. `runMarketScan`'s batched
   * multi-symbol fetch), so this call can skip its own five-timeframe fetch.
   * Undefined falls back to fetching individually — the pre-batching path.
   */
  prefetched?: AllTimeframeBars,
): Promise<ScanResult> {
  const assetClass: AssetClass = isCryptoSymbol(symbol) ? "crypto" : "us_equity";
  const scannedAt = new Date().toISOString();
  const setupKind: SetupKind = preference?.kind ?? "reversion";

  try {
    const provider = getMarketDataProvider();
    const [{ monthly, weekly, daily, hourly, m15 }, currentPrice] = await Promise.all([
      prefetched ?? fetchAllTimeframes(symbol, assetClass),
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
      fanLines: fanLines.slice(0, 6).map(({ angle, price, distancePct, role }) => ({
        angle,
        price: Math.round(price * 100) / 100,
        distancePct,
        role,
      })),
      squareOf9: s9.slice(0, 6).map(({ degree, price, distancePct, role }) => ({
        degree,
        price: Math.round(price * 100) / 100,
        distancePct,
        role,
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
    // Read once, shared by the large-cap check below and the `liquidity` field
    // on the returned result — same daily bars either way, no reason to read
    // them twice.
    const liquidity = readLiquidity(daily) ?? undefined;
    const largeCap = isLargeCapStock(symbol, assetClass, liquidity);

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
          largeCap,
        );
      } catch (err) {
        levelsError = err instanceof Error ? err.message : String(err);
      }
    }

    // ---- Supporting signals
    //
    // Each level keeps the timeframe it was read off — the flat number-only
    // list this used to be threw that away, so the "near S/R" criterion could
    // never say more than yes/no. See lib/analysis/levelRole.ts for why the
    // originating timeframe is what tells a trader how to use the level.
    const allLevels = [
      ...dailyTrend.support.map((price) => ({ price, timeframe: dailyTrend.timeframe })),
      ...dailyTrend.resistance.map((price) => ({ price, timeframe: dailyTrend.timeframe })),
      ...weeklyTrend.support.map((price) => ({ price, timeframe: weeklyTrend.timeframe })),
      ...weeklyTrend.resistance.map((price) => ({ price, timeframe: weeklyTrend.timeframe })),
      ...monthlyTrend.support.map((price) => ({ price, timeframe: monthlyTrend.timeframe })),
      ...monthlyTrend.resistance.map((price) => ({ price, timeframe: monthlyTrend.timeframe })),
    ];
    const recentAtr = atr(daily.slice(-20), 14);
    const baselineAtr = atr(daily.slice(-100, -20), 14);
    const momentumElevated = baselineAtr > 0 && recentAtr / baselineAtr >= 1.2;

    // The structural proximity criteria are measured in multiples of this
    // symbol's own daily range, so "near a level" is the same fraction of a
    // day's move on a utility as on a high-beta name.
    const atrPct = atrPercentOfPrice(recentAtr, currentPrice);
    const srBandPct = proximityBandPct(SR_PROXIMITY_ATR, FALLBACK_SR_PCT, atrPct);
    const srMatch = nearestLevelMatch(currentPrice, allLevels, srBandPct);
    const nearSupportResistance = srMatch !== null;

    // The bars above are what the verdict is computed on, and on the free feed
    // they are ~15 minutes old — a full candle on the 15-minute execution
    // timeframe. That is a property of the decision, not of the chart legend.
    const dataLag = decisionLag(
      EXECUTION_TIMEFRAME,
      feedDelayMs(assetClass, provider.isLive),
      marketSession(assetClass) === "regular",
    );

    const decision = applyDataLagHold(
      applyReversionConfirmation(
        computeScore({
          direction: scoreDirection,
          macroTrends: [monthlyTrend, weeklyTrend, dailyTrend],
          hourlyTrend,
          gann,
          nearSupportResistance,
          srMatch: srMatch && { ...srMatch, role: levelRole(currentPrice, srMatch.price) },
          pattern,
          momentumElevated,
          levels,
          setupKind,
          atrPct,
          weights: await getActiveCriterionWeights(),
        }),
        pattern,
        momentumElevated,
        nearSupportResistance,
      ),
      dataLag,
    );

    // ---- Signal and Regime Engine (lib/signals) — a separate decision layer
    // from the Gann/STRAT verdict above, never merged into it. This is a
    // symbol-only scan with no specific account in scope, so the account-only
    // gates (sizing, correlation, cooldown, total open risk) are optimistic
    // placeholders — see `accountContextAssumed` on the returned verdict and
    // `lib/signals/scanGates.ts`. Callers with a real account (e.g. Guided
    // Decision Mode) should treat `tradeable` here as informational only.
    const HOLD_PERIOD_DAYS = 7;
    const marketGates = buildScanMarketGates({
      liquidity: liquidity ?? null,
      liquidityOk: meetsLiquidityFloor(liquidity ?? null, assetClass).ok,
      binaryEventInHoldPeriod: isBinaryEventInHoldPeriod(
        symbol.toUpperCase(),
        new Date(scannedAt),
        HOLD_PERIOD_DAYS,
      ),
      dataLagged: dataLag.holdsExecute,
    });
    const regime = classifyRegime({ bars: daily });
    const trendPullback: SignalVerdict | null =
      regime.regime === "trend" && regime.direction !== "sideways"
        ? evaluateTrendPullback({
            direction: regime.direction,
            htfBars: daily,
            executionBars: closedM15,
            vwapAnchorIndex: Math.max(0, closedM15.length - 20),
            gates: marketGates,
            accountContextAssumed: true,
          })
        : null;
    // Trend Breakout does its own base/compression read from price action
    // rather than gating on the regime label (see requiredRegime's doc
    // comment in lib/signals/types.ts), so it's evaluated unconditionally,
    // in the same direction bias the rest of this scan already committed to.
    const trendBreakout: SignalVerdict | null =
      closedM15.length >= 17
        ? evaluateTrendBreakout({
            direction: scoreDirection,
            htfBars: daily,
            executionBars: closedM15,
            gates: marketGates,
            accountContextAssumed: true,
          })
        : null;

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
      dataLag,
      executionBar: closedM15[closedM15.length - 1],
      decision,
      // Read off the same daily bars the structure was computed from, so any
      // consumer can apply the platform-wide liquidity floor without a second
      // fetch — see lib/scan/liquidity.ts.
      liquidity,
      optionPremium,
      signals: { regime, trendPullback, trendBreakout },
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

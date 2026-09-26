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
import {
  type AllTimeframeBars,
  fetchAllTimeframes,
  getMarketDataProvider,
} from "@/lib/data/provider";
import { EXECUTION_TIMEFRAME } from "@/lib/timeframe";
import { readTrend } from "@/lib/analysis/trend";
import { atr } from "@/lib/analysis/pivots";
import { relativeVolume } from "@/lib/signals/indicators";
import { countLevelTests, levelRole } from "@/lib/analysis/levelRole";
import { computeFanLines } from "@/lib/gann/fans";
import { recentSquareOf9Levels } from "@/lib/gann/squareOf9";
import { timeCycles, yearCycleConvergence } from "@/lib/gann/timeCycles";
import { computeAngleSlopes } from "@/lib/gann/normalizedSlope";
import { computeRetracementLevels } from "@/lib/gann/retracement";
import { priceTimeConfluence } from "@/lib/gann/digitalRoot";
import { computeCampaignLeg, computeSwingChart } from "@/lib/gann/swingChart";
import { computeRuleOfThree } from "@/lib/gann/ruleOfThree";
import { computeTimePriceSquare } from "@/lib/gann/timePriceSquare";
import { computeVolumeClimax } from "@/lib/gann/volumeClimax";
import { computeBoilingPoint } from "@/lib/gann/boilingPoint";
import { MIN_DAILY_BARS_FOR_SCAN, preferredEntryDirection, rankArmedPatterns } from "@/lib/scan/entrySelection";
import { computeTradeLevels, type EntrySource } from "@/lib/strat/levels";
import { computeGannEntryTrigger } from "@/lib/gann/entryTrigger";
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
import { evaluateConfirmedReversal } from "@/lib/signals/states/confirmedReversal";
import { evaluateRangeReversion } from "@/lib/signals/states/rangeReversion";
import { buildScanMarketGates } from "@/lib/signals/scanGates";
import type { SignalVerdict } from "@/lib/signals/types";
import { buildScanNoviceEligibility } from "@/lib/universe/scanGates";
import { DEFAULT_UNIVERSE_THRESHOLDS, type UniverseThresholds } from "@/lib/universe/eligibility";
import { evaluateGannConfluence } from "@/lib/signals/confluence/gann";
import { evaluateSaraConfluence } from "@/lib/signals/confluence/sara";
import { routeMarketAdapter } from "@/lib/signals/confluence/marketAdapters";
import { isConfluenceModuleEnabled } from "@/lib/signals/confluence/flags";

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

// EXECUTION_TIMEFRAME is imported below from lib/timeframe.ts, not defined
// here — see that constant's own comment for the full temporary-override
// rule. This file imports levelRole.ts, so defining the constant here and
// importing it back into levelRole.ts would be a circular value import: it
// type-checked cleanly under `tsc --noEmit` and then broke Next.js's actual
// build (`Failed to collect page data for /api/batch-scan`), which is why the
// definition lives in a leaf module instead.

/**
 * Buckets the same recent-ATR / baseline-ATR expansion ratio
 * `momentumElevated` is computed from into the `volatility_state` table's
 * (migration 0064) four labels. A ratio, not a distributional percentile —
 * see `ScanResult.volatilityRead`'s doc comment.
 */
function volatilityRegimeFromAtrRatio(ratio: number): "low" | "normal" | "elevated" | "extreme" {
  if (ratio >= 2.0) return "extreme";
  if (ratio >= 1.2) return "elevated";
  if (ratio >= 0.8) return "normal";
  return "low";
}

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
  /**
   * `getUniversePolicy()`-resolved thresholds for the Market Universe engine,
   * resolved once per batch by the caller (e.g. `runMarketScan`) rather than
   * per symbol — see lib/universe/policy.ts's module doc for why a per-call
   * resolve here would mean a DB round trip per symbol per scan. Defaults to
   * the code constants, so every existing caller is unaffected.
   */
  universeThresholds: UniverseThresholds = DEFAULT_UNIVERSE_THRESHOLDS,
): Promise<ScanResult> {
  const assetClass: AssetClass = isCryptoSymbol(symbol) ? "crypto" : "us_equity";
  const scannedAt = new Date().toISOString();
  const setupKind: SetupKind = preference?.kind ?? "reversion";

  try {
    const provider = getMarketDataProvider();
    const [{ monthly, weekly, daily, hourly, execution }, currentPrice] = await Promise.all([
      prefetched ?? fetchAllTimeframes(symbol, assetClass, EXECUTION_TIMEFRAME),
      provider.fetchLatestPrice(symbol, assetClass),
    ]);

    if (daily.length < MIN_DAILY_BARS_FOR_SCAN || execution.length < 10) {
      throw new Error(`Insufficient bar data for ${symbol}`);
    }

    // ---- Level 1: macro trends + S/R (10yr monthly, 5yr weekly, 1yr daily)
    const monthlyTrend = readTrend(monthly, "1Month");
    const weeklyTrend = readTrend(weekly, "1Week");
    const dailyTrend = readTrend(daily, "1Day");
    // Gann's 3-day/9-day swing charts, replacing the monthly/weekly/daily
    // macroTrend agreement check — same daily bars, a different (reversal-
    // count) construction. See lib/gann/swingChart.ts.
    const swingChart = computeSwingChart(daily);
    // Gann's "sections of a campaign" leg count, added 2026-09-16 — confluence/
    // context only, see lib/gann/swingChart.ts#computeCampaignLeg.
    const campaignLeg = computeCampaignLeg(daily);
    // Gann's Rule of Three, added 2026-09-16 — see lib/gann/ruleOfThree.ts.
    const ruleOfThree = computeRuleOfThree(daily);

    // ---- Level 2: 1hr refinement
    const hourlyTrend = readTrend(hourly, "1Hour");

    // ---- Gann structures (anchored on the daily chart)
    const fanLines = computeFanLines(daily, currentPrice);
    const s9 = recentSquareOf9Levels(daily, currentPrice).slice(0, 12);
    const cycles = timeCycles(daily);
    // The yearly cycles need the 10-year monthly chart; the daily read above
    // only reaches the day-count wheel. See yearCycleConvergence.
    const yearCycles = yearCycleConvergence(monthly);
    const angleSlopes = computeAngleSlopes(daily, currentPrice);
    // Gann's squaring of price and time, replacing timeCycle — same anchors
    // as angleSlopes, a different (raw count-for-count) construction.
    const timePriceSquare = computeTimePriceSquare(daily, currentPrice);
    // Volume climax at the same pivots, replacing harmonicProximity.
    const volumeClimax = computeVolumeClimax(daily);
    // Gann's "boiling point" blow-off duration off the same climax anchors,
    // added 2026-09-16 — confluence/context only, see lib/gann/boilingPoint.ts.
    const boilingPoint = computeBoilingPoint(daily, volumeClimax);
    const retracementLevels = computeRetracementLevels(daily, currentPrice);
    // Digital-root/vortex confluence off the same anchors angleSlopes reads —
    // confluence/context only (blueprint 7.4); score.ts's gannRetracementConfluence
    // criterion ANDs this with the retracement match above rather than gating on
    // it alone. See lib/gann/digitalRoot.ts's priceTimeConfluence.
    const digitalRootConfluences = angleSlopes
      .map((r) => {
        const confluence = priceTimeConfluence(currentPrice, r.anchorPrice, r.barsSinceAnchor);
        return confluence && { anchorKind: r.anchorKind, ...confluence };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);

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
      timeCycleBullishActive: cycles.bullishActive,
      timeCycleBearishActive: cycles.bearishActive,
      timeCycleDates: cycles.dates,
      timeCycleFixedCalendarActive: cycles.fixedCalendarActive,
      timeCycleFixedCalendarDates: cycles.fixedCalendarDates,
      yearCycleBullishHits: yearCycles.bullishHits,
      yearCycleBearishHits: yearCycles.bearishHits,
      angleSlopes,
      retracementLevels: retracementLevels.slice(0, 7).map(({ fraction, label, price, distancePct, role, importance }) => ({
        fraction,
        label,
        price: Math.round(price * 100) / 100,
        distancePct,
        role,
        importance,
      })),
      digitalRootConfluences,
    };

    // ---- Level 3: 15min precision entry via reversal patterns (closed bars only)
    const closedExecutionBars = execution.slice(0, -1); // treat the final bar as potentially live
    // The execution-timeframe ATR sets the noise floor a setup's stop has to
    // clear; without it a narrow bar arms a pattern no one could actually hold.
    const executionAtr = atr(closedExecutionBars.slice(-30), 14);
    // Direction and pattern ranking are shared with the backtest replay
    // (lib/scan/entrySelection.ts) so the two cannot drift — see that
    // module's header. Direction: against the macro move, weighted by Gann's
    // chart-timeframe power ratio (a single monthly trend outweighs weekly +
    // daily disagreeing with it, per Wall Street Stock Selector, 1930). A
    // caller hunting a continuation supplies its own direction instead.
    const preferredDirection = preferredEntryDirection(
      [monthlyTrend, weeklyTrend, dailyTrend],
      preference,
    );
    const armedPatterns = rankArmedPatterns({
      closedExecutionBars,
      currentPrice,
      executionAtr,
      preferredDirection,
      setupKind,
    });

    const pattern: StratPattern | null = armedPatterns[0] ?? null;

    // ---- What arms and prices the trade (changed 2026-09-17)
    //
    // The trade plan used to be armed and priced by the bar-sequence pattern
    // above: `direction` was the pattern's, and `computeTradeLevels` read its
    // `triggerPrice`/`stopPrice`. That made Rob Smith's STRAT the source of
    // every entry price and, through `riskPerShare`, every position size —
    // the single most load-bearing non-Gann component on the platform.
    //
    // It is now Gann's own rule: crossing an old swing top or bottom plus the
    // "lost motion" allowance (`lib/gann/entryTrigger.ts`, sourced to the nine
    // Buying Points and nine Selling Points). Direction comes from
    // `preferredDirection`, which is already Gann-derived — `weightedTrendAgreement`
    // over monthly/weekly/daily using his chart-timeframe power ratio.
    //
    // The bar-sequence pattern is NOT removed. It keeps its display and
    // confluence role (`armedPatterns`, the price-action confluence layer),
    // which the project owner examined and deliberately kept — see AGENTS.md's
    // "Audit outcomes". What it no longer does is decide where an order goes.
    const gannTrigger = computeGannEntryTrigger(daily, preferredDirection);

    const direction: "bullish" | "bearish" | "none" = gannTrigger?.direction ?? "none";
    const scoreDirection = gannTrigger?.direction ?? preferredDirection;

    // The label is what the invalidation copy calls this setup. It describes
    // what was crossed rather than naming a bar sequence, because that is what
    // actually armed the trade now.
    const entrySource: EntrySource | null = gannTrigger
      ? {
          direction: gannTrigger.direction,
          triggerPrice: gannTrigger.triggerPrice,
          stopPrice: gannTrigger.stopPrice,
          setupLabel:
            gannTrigger.direction === "bullish" ? "swing-top crossing" : "swing-bottom break",
        }
      : null;

    // ---- Trade levels
    const previousBar = closedExecutionBars[closedExecutionBars.length - 2] ?? closedExecutionBars[closedExecutionBars.length - 1];
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

    // ---- Supporting signals
    //
    // Each level keeps the timeframe it was read off — the flat number-only
    // list this used to be threw that away, so the "near S/R" criterion could
    // never say more than yes/no. See lib/analysis/levelRole.ts for why the
    // originating timeframe is what tells a trader how to use the level.
    //
    // Computed ahead of the trade-plan block below (moved 2026-09-11):
    // computeTradeLevels's equities path needs both the full level list and
    // atrPct to anchor a percent-based stop/runner — see
    // lib/strat/levels.ts#computeEquityTradeLevels.
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

    let levels: TradeLevels | null = null;
    let levelsError: string | undefined;
    if (entrySource) {
      try {
        levels = computeTradeLevels(
          entrySource,
          previousBar,
          gannTargets,
          optionPremium,
          executionAtr,
          assetClass,
          largeCap,
          allLevels.map((l) => l.price),
          atrPct,
        );
      } catch (err) {
        levelsError = err instanceof Error ? err.message : String(err);
      }
    }
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
          swingChart,
          campaignLeg,
          ruleOfThree,
          timePriceSquare,
          volumeClimax,
          boilingPoint,
          gann,
          nearSupportResistance,
          srMatch: srMatch && {
            ...srMatch,
            role: levelRole(currentPrice, srMatch.price),
            testCount: countLevelTests(daily, srMatch.price, srBandPct),
          },
          pattern,
          gannTrigger,
          momentumElevated,
          levels,
          stopAtrMultiple:
            levels && executionAtr > 0 ? levels.riskPerShare / executionAtr : null,
          assetClass,
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
    const binaryEventInHoldPeriod = isBinaryEventInHoldPeriod(
      symbol.toUpperCase(),
      new Date(scannedAt),
      HOLD_PERIOD_DAYS,
    );
    const marketGates = buildScanMarketGates({
      liquidity: liquidity ?? null,
      liquidityOk: meetsLiquidityFloor(liquidity ?? null, assetClass).ok,
      binaryEventInHoldPeriod,
      dataLagged: dataLag.holdsExecute,
    });

    // ---- Market Universe, Data Quality & Account Constraints (lib/universe)
    // — a third, independent decision layer: not the Gann/STRAT verdict above,
    // not the Signal and Regime Engine's `signals`, but the coarser question
    // of whether this symbol belongs in a novice's universe at all. See
    // docs/MARKET_UNIVERSE_DATA_QUALITY.md.
    const noviceUniverse = buildScanNoviceEligibility(
      {
        symbol,
        assetClass,
        currentPrice,
        liquidity: liquidity ?? null,
        dailyBars: daily,
        binaryEventInHoldPeriod,
        dataLagged: dataLag.holdsExecute,
        scannedAt,
      },
      universeThresholds,
    );
    const regime = classifyRegime({ bars: daily });

    // ---- Gann Confluence Layer / Sara Confluence Layer — the addendum's
    // cross-market confluence modules (2026-08-28). Additive and
    // feature-flagged: disabling either does not affect any signal above.
    // Both route through the market adapter for this scan's asset class
    // before evaluating, and neither may set a gate or a state's tradeable
    // verdict — see docs/GANN_SARA_CONFLUENCE.md.
    const confluenceMarket = routeMarketAdapter(assetClass).market;
    const gannConfluence = isConfluenceModuleEnabled("gann_confluence_layer", confluenceMarket)
      ? evaluateGannConfluence({
          assetClass,
          symbol,
          dailyBars: daily,
          currentPrice,
          direction: scoreDirection,
        })
      : null;
    const saraConfluence = isConfluenceModuleEnabled(
      "sara_sniper_confluence_layer",
      confluenceMarket,
    )
      ? evaluateSaraConfluence({
          assetClass,
          symbol,
          closedExecutionBars,
          currentPrice,
          htfDirection: regime.direction !== "sideways" ? regime.direction : null,
        })
      : null;

    const trendPullback: SignalVerdict | null =
      regime.regime === "trend" && regime.direction !== "sideways"
        ? evaluateTrendPullback({
            direction: regime.direction,
            htfBars: daily,
            executionBars: closedExecutionBars,
            vwapAnchorIndex: Math.max(0, closedExecutionBars.length - 20),
            gates: marketGates,
            accountContextAssumed: true,
          })
        : null;
    // Trend Breakout does its own base/compression read from price action
    // rather than gating on the regime label (see requiredRegime's doc
    // comment in lib/signals/types.ts), so it's evaluated unconditionally,
    // in the same direction bias the rest of this scan already committed to.
    const trendBreakout: SignalVerdict | null =
      closedExecutionBars.length >= 17
        ? evaluateTrendBreakout({
            direction: scoreDirection,
            htfBars: daily,
            executionBars: closedExecutionBars,
            gates: marketGates,
            accountContextAssumed: true,
          })
        : null;
    // Confirmed Reversal likewise reads its own exhaustion/break/hold
    // structure from price action rather than the regime label.
    const confirmedReversal: SignalVerdict | null =
      closedExecutionBars.length >= 22
        ? evaluateConfirmedReversal({
            direction: scoreDirection,
            htfBars: daily,
            executionBars: closedExecutionBars,
            gates: marketGates,
            accountContextAssumed: true,
          })
        : null;
    // Range Reversion likewise reads its own boundaries/rejection from
    // price action rather than the regime label.
    const rangeReversion: SignalVerdict | null =
      closedExecutionBars.length >= 26
        ? evaluateRangeReversion({
            direction: scoreDirection,
            htfBars: daily,
            executionBars: closedExecutionBars,
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
      executionBar: closedExecutionBars[closedExecutionBars.length - 1],
      decision,
      // Read off the same daily bars the structure was computed from, so any
      // consumer can apply the platform-wide liquidity floor without a second
      // fetch — see lib/scan/liquidity.ts.
      liquidity,
      // Internal only — stripped at the API boundary by redactScanResult.
      // See lib/learning/record.ts for the `bar`/`volatility_state`/
      // `volume_state` tables this backs.
      dailyBars: daily,
      volatilityRead:
        baselineAtr > 0 ? { atr: recentAtr, regime: volatilityRegimeFromAtrRatio(recentAtr / baselineAtr) } : undefined,
      volumeRead: { relativeVolumeIndex: relativeVolume(daily, 20) },
      optionPremium,
      signals: {
        regime,
        trendPullback,
        trendBreakout,
        confirmedReversal,
        rangeReversion,
        gannConfluence,
        saraConfluence,
      },
      noviceUniverse,
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
      gann: {
        fanLines: [],
        squareOf9: [],
        timeCycleActive: false,
        timeCycleBullishActive: false,
        timeCycleBearishActive: false,
        timeCycleDates: [],
        angleSlopes: [],
        retracementLevels: [],
        digitalRootConfluences: [],
      },
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

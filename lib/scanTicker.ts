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
import { readDisclosedRules } from "@/lib/gann/disclosedRules";
import { readPillarFacts } from "@/lib/scoring/pillars";
import { buildStructuralLevels } from "@/lib/scan/structuralLevels";
import { getUniverseStrength } from "@/lib/data/universeStrength";
import { readWindowTurn } from "@/lib/gann/timeWindow";
import { readRuleFollowing } from "@/lib/gann/ruleFollowing";
import { computeTimePriceSquare } from "@/lib/gann/timePriceSquare";
import { computeVolumeClimax } from "@/lib/gann/volumeClimax";
import { readDistributionStanding } from "@/lib/gann/distribution";
import { readMultipleTops } from "@/lib/gann/multipleTops";
import { computeBoilingPoint } from "@/lib/gann/boilingPoint";
import { armSessionEntries, chooseSessionEntry, entryChart, gannEntryOf, isWithGannTrend, MIN_DAILY_BARS_FOR_SCAN, preferredEntryDirection, rankArmedPatterns } from "@/lib/scan/entrySelection";
import type { GannEntryTrigger } from "@/lib/gann/entryTrigger";
import { computeTradeLevels, gannEntrySource, gannTargetPool, type EntrySource } from "@/lib/strat/levels";
import { isLargeCapStock } from "@/lib/strat/large-cap";
import {
  applyBreakawayHold,
  applyDistributionBreakdownHold,
  applyFailedTopHold,
  applyTimeWindowHold,
  applyRuleFollowingHold,
  applyWeakStockHold,
  applyFigureCrossingHold,
  applyMonthlyBreakHold,
  applyDataLagHold,
  applyStopBreachHold,
  applyStandAsideHold,
  computeScore,
  srMatchForSide,
} from "@/lib/scoring/score";
import { withDecisionState } from "@/lib/scoring/decisionState";
import { readBreakaway } from "@/lib/gann/breakaway";
import { buildCampaignLedger, readMonthlyBreakWarning } from "@/lib/gann/campaignLedger";
import { readLeadership, readWeakStockFrom, selectionStrength } from "@/lib/gann/leadership";
import { figureCrossingOf } from "@/lib/gann/evenFigures";
import { readStopBreach } from "@/lib/gann/stopBreach";
import { decisionLag, feedDelayMs } from "@/lib/data/latency";
import { etDateKey, marketSession } from "@/lib/market/session";
import { levelCharts, yearCycleMonths } from "@/lib/scan/levelCharts";
import {
  atrPercentOfPrice,
  nearestLevelMatchByRole,
  levelBandPct,
} from "@/lib/scoring/proximity";
import { getActiveCriterionWeights } from "@/lib/scoring/active-weights";
import { meetsLiquidityFloor, readLiquidity } from "@/lib/scan/liquidity";
import { classifyRegime } from "@/lib/signals/regime";
import { isScheduledReportDay } from "@/lib/macro/earnings";
import { evaluateTrendPullback } from "@/lib/signals/states/trendPullback";
import { evaluateTrendBreakout } from "@/lib/signals/states/trendBreakout";
import { evaluateConfirmedReversal } from "@/lib/signals/states/confirmedReversal";
import { evaluateRangeReversion } from "@/lib/signals/states/rangeReversion";
import { buildScanMarketGates } from "@/lib/signals/scanGates";
import type { SignalVerdict } from "@/lib/signals/types";
import { buildScanNoviceEligibility } from "@/lib/universe/scanGates";
import { DEFAULT_UNIVERSE_THRESHOLDS, type UniverseThresholds } from "@/lib/universe/eligibility";
import { evaluateGannConfluence } from "@/lib/signals/confluence/gann";
import { getInstrumentReference } from "@/lib/data/instrumentReference";
import { getMarketDailyBars, getMarketMonthlyBars } from "@/lib/data/marketBenchmark";
import { evaluateSaraConfluence } from "@/lib/signals/confluence/sara";
import { routeMarketAdapter } from "@/lib/signals/confluence/marketAdapters";
import { isConfluenceModuleEnabled } from "@/lib/signals/confluence/flags";

/**
 * What the caller is looking for. Left unset, a scan hunts reversions and
 * prefers the armed pattern that trades against the macro move — the protocol's
 * default. The market scan sets it when it is deliberately looking for a
 * setup with the trend instead, so the pattern chosen, the trade plan priced
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
  let setupKind: SetupKind = preference?.kind ?? "reversion";

  try {
    const provider = getMarketDataProvider();
    // The stored shares outstanding and inception date (parity roadmap D2,
    // D3) load alongside the bars. The whole table is read once per server
    // instance and cached, so after the first symbol this resolves at once.
    const [{ monthly, monthlyLong, monthlyYearCount, weekly, daily, hourly, execution }, currentPrice, instrumentReference, marketDaily, marketMonthly, universeStrength] = await Promise.all([
      prefetched ?? fetchAllTimeframes(symbol, assetClass, EXECUTION_TIMEFRAME),
      provider.fetchLatestPrice(symbol, assetClass),
      assetClass === "us_equity" ? getInstrumentReference(symbol) : Promise.resolve(null),
      // The market's daily bars for Gann's early/late leaders; read once a day.
      assetClass === "us_equity" ? getMarketDailyBars() : Promise.resolve(null),
      // The market's monthly bars, to date its bull market for Gann's weak stocks.
      assetClass === "us_equity" ? getMarketMonthlyBars() : Promise.resolve(null),
      // The scan universe's monthly bars, for Gann's relative strength rank
      // (S6); read once a day, alongside the rest.
      assetClass === "us_equity" ? getUniverseStrength() : Promise.resolve(null),
    ]);

    if (daily.length < MIN_DAILY_BARS_FOR_SCAN || execution.length < 10) {
      throw new Error(`Insufficient bar data for ${symbol}`);
    }

    // ---- Level 1: macro trends + S/R, read from the level charts the replay
    // reads too (PLAN.md item 9 step 4): 52 weeks of completed sessions, 5
    // years of weeks and 10 calendar years of months, each bar in progress
    // built from completed sessions. See lib/scan/levelCharts.ts.
    const sessionDay = etDateKey(new Date(scannedAt));
    const charts = levelCharts({ daily, weekly, monthly: monthlyLong ?? monthly }, sessionDay);
    // Completed sessions only, all the history held, as the replay's
    // `buildMacroContext` reads them (`priorSessions`). The raw `daily` ends in
    // today's session while it trades; every scored or verdict-affecting read
    // below takes `sessions` so the live scan never scores an intraday bar the
    // replay never sees (2026-10-20). `daily` stays for display, the learning
    // record and the data-quality checks, which want the latest bar.
    const sessions = daily.filter((b) => b.t.slice(0, 10) < sessionDay);
    // The replay's session date, at noon UTC (`buildMacroContext`'s asOf).
    const sessionNoon = new Date(`${sessionDay}T12:00:00Z`);
    const monthlyTrend = readTrend(charts.monthly, "1Month");
    const weeklyTrend = readTrend(charts.weekly, "1Week");
    const dailyTrend = readTrend(charts.daily, "1Day");
    // Gann's 3-Day and 7-day weekly swing charts, replacing the monthly/weekly/daily
    // macroTrend agreement check — same daily bars, a different (reversal-
    // count) construction. See lib/gann/swingChart.ts.
    const swingChart = computeSwingChart(sessions);
    // Gann's "sections of a campaign" leg count, added 2026-09-16 — confluence/
    // context only, see lib/gann/swingChart.ts#computeCampaignLeg.
    const campaignLeg = computeCampaignLeg(sessions);
    // Gann's Rule of Three, added 2026-09-16 — see lib/gann/ruleOfThree.ts.
    // Completed sessions only: a session still trading has no close yet, and
    // the replay reads the same (review 25, R3-3).
    const ruleOfThree = computeRuleOfThree(charts.daily);
    // Gann applies the rule to weekly and monthly closes too (2026-09-27).
    const ruleOfThreeWeekly = charts.weekly.length >= 4 ? computeRuleOfThree(charts.weekly) : null;
    const ruleOfThreeMonthly = charts.monthly.length >= 4 ? computeRuleOfThree(charts.monthly) : null;

    // ---- Level 2: 1hr refinement
    const hourlyTrend = readTrend(hourly, "1Hour");

    // ---- Gann structures (anchored on the daily chart)
    const fanLines = computeFanLines(charts.daily, currentPrice);
    const s9 = recentSquareOf9Levels(charts.daily, currentPrice).slice(0, 12);
    const cycles = timeCycles(sessions, sessionNoon);
    // The yearly cycles need the 10-year monthly chart; the daily read above
    // only reaches the day-count wheel. See yearCycleConvergence.
    // The closed months at the session's noon, as the replay tags its trades
    // (`yearCycleHitsAt`): not the provider's month in progress, and not the
    // wall clock, whose UTC month runs ahead of the ET session in the evening.
    const yearCycles = yearCycleConvergence(yearCycleMonths(monthlyLong ?? monthly, sessionDay), sessionNoon);
    const angleSlopes = computeAngleSlopes(sessions, currentPrice);
    // Gann's squaring of price and time, replacing timeCycle — same anchors
    // as angleSlopes, a different (raw count-for-count) construction.
    const timePriceSquare = computeTimePriceSquare(sessions, currentPrice);
    // Volume climax at the same pivots, replacing harmonicProximity.
    // Completed sessions and months only, and the smallest month in years (A-VOLUME-09).
    const volumeClimax = computeVolumeClimax(sessions, undefined, { asOf: sessionNoon, monthly });
    // Gann's "boiling point" blow-off duration off the same climax anchors,
    // added 2026-09-16 — confluence/context only, see lib/gann/boilingPoint.ts.
    const boilingPoint = computeBoilingPoint(sessions, volumeClimax);
    const retracementLevels = computeRetracementLevels(charts.daily, currentPrice);
    // Digital-root/vortex confluence off the same anchors angleSlopes reads —
    // confluence/context only (blueprint 7.4): score.ts's gannRetracementConfluence
    // shows it on the card and no longer ANDs it in (fork FL5 a, 2026-10-16).
    // See lib/gann/digitalRoot.ts's priceTimeConfluence.
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
    // module's header. With no direction asked for, the scan arms against
    // Gann's trend, weighted by his chart-timeframe power ratio (a single
    // monthly trend outweighs weekly + daily disagreeing with it, per Wall
    // Street Stock Selector, 1930), and with no trend on any chart, the nearer
    // of the two sides' buying points (PLAN.md item 6 step 11, fork F4 a). A
    // caller hunting a continuation supplies its own direction instead.
    //
    // Read from completed sessions in the last 52 weeks, the window the replay
    // and every other surface read it from, with the monthly chart's previous
    // year's levels and record (`entryChart`, item 5 step 3).
    const chart = entryChart(daily, monthly, etDateKey(new Date(scannedAt)));
    const entryDaily = chart.bars;
    const macroTrends = [monthlyTrend, weeklyTrend, dailyTrend];
    const entryOf = gannEntryOf(entryDaily, chart.older, macroTrends);
    // With no direction asked for, the scan reads what the session arms
    // (`armSessionEntries`, the same two readings the market scan's two passes
    // and the replay take): the reversion against the trend, and the buying
    // point with it. Before 2026-10-20 only the reversion was read here, so a
    // symbol published on the daily list from the continuation pass (with the
    // trend) opened on its own page scored against the trend, on a side that
    // had armed nothing: SHEL on 2026-10-16 read 8 of 9 Buy on the list and
    // 2 of 9 Sell on its page at the same minute and price. When both sides
    // arm, the nearer buying point is the one (the no-trend rule, fork F4 a).
    let gannTrigger: GannEntryTrigger | null = null;
    let setAsideEntry: ScanResult["setAsideEntry"] = null;
    if (preference) {
      gannTrigger = entryOf(preference.direction);
      // The other side's buying point, when it armed too, is set aside here
      // as it is with no direction asked for, so the list row from the
      // continuation pass and the symbol's page record the same thing (review
      // of #395, finding 3).
      // Only when the asked side is the one with the trend: a point the
      // other way is set aside against the trend, never the reverse.
      if (gannTrigger && entryDaily.length > 0 && isWithGannTrend(macroTrends, preference.direction)) {
        const other = armSessionEntries(macroTrends, entryOf, entryDaily[entryDaily.length - 1].c).find(
          (a) => a.trigger.direction !== gannTrigger!.direction,
        );
        if (other) setAsideEntry = { setupKind: other.setupKind, direction: other.trigger.direction };
      }
    } else if (entryDaily.length > 0) {
      const chosen = chooseSessionEntry(macroTrends, entryOf, entryDaily[entryDaily.length - 1].c);
      if (chosen) {
        gannTrigger = chosen.trigger;
        setupKind = chosen.setupKind;
        setAsideEntry = chosen.setAside;
      }
    }
    const preferredDirection = gannTrigger?.direction ?? preferredEntryDirection(macroTrends, preference);
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
    // 3-point allowance, price-scaled (`lib/gann/entryTrigger.ts`, sourced to the nine
    // Buying Points and nine Selling Points). Direction comes from
    // `reversionEntry` above, Gann's weighted trend over monthly/weekly/daily.
    //
    // The bar-sequence pattern is NOT removed. It keeps its display and
    // confluence role (`armedPatterns`, the price-action confluence layer),
    // which the project owner examined and deliberately kept — see AGENTS.md's
    // "Audit outcomes". What it no longer does is decide where an order goes.
    //
    // Since PLAN.md item 5 step 2 the old bottom (top) is a buying point too:
    // Gann's double and triple bottoms. Of the two, the plan is priced from
    // the one nearer the price (`selectGannEntry`).

    const direction: "bullish" | "bearish" | "none" = gannTrigger?.direction ?? "none";
    // No trigger and no trend: no side to take. The scorecard is read on the
    // long side as a reading only, and the verdict stands aside (D-05).
    const standAside = !gannTrigger && preferredDirection === null;
    const scoreDirection = gannTrigger?.direction ?? preferredDirection ?? "bullish";

    // The label is what the invalidation copy calls this setup. It describes
    // what was crossed rather than naming a bar sequence, because that is what
    // actually armed the trade now.
    // Gann's reaction buy (PLAN.md item 4): the plan's entry is the level plus
    // 1 point and its stop the level less 3; the close 3 points past the level
    // arms it. Priced by the same helper the replay uses.
    const entrySource: EntrySource | null = gannTrigger ? gannEntrySource(gannTrigger) : null;

    // ---- Trade levels
    const previousBar = closedExecutionBars[closedExecutionBars.length - 2] ?? closedExecutionBars[closedExecutionBars.length - 1];
    const gannTargets = gannTargetPool(gann);
    // A trade-plan failure is confined to the trade plan. The rest of the scan
    // — price, trends, structural levels, checklist — is still valid and worth
    // showing, so it degrades to "no levels" with a note instead of collapsing
    // the whole scan into an error and leaving the ticker page blank.
    // Read once, shared by the large-cap check below and the `liquidity` field
    // on the returned result — same completed sessions either way (the
    // replay's `readLiquidity(priorSessions)`), no reason to read them twice.
    const liquidity = readLiquidity(sessions) ?? undefined;
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
    // The campaign ledger on the level chart, as the replay's
    // `readDisclosedRules` builds it.
    const campaignLedger = buildCampaignLedger(charts.daily);
    // One builder for both surfaces (lib/scan/structuralLevels.ts): `all` is
    // the S/R list, `old` the old levels `historicalSR` reads (heldLevel.ts).
    const structural = buildStructuralLevels({
      trends: { daily: dailyTrend, weekly: weeklyTrend, monthly: monthlyTrend },
      charts,
      campaign: campaignLedger,
      price: currentPrice,
      asOf: sessionNoon,
      companyName: instrumentReference?.name ?? null,
    });
    const allLevels = structural.all;
    const recentAtr = atr(sessions.slice(-20), 14);
    const baselineAtr = atr(sessions.slice(-100, -20), 14);
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
    const srBandPct = levelBandPct(currentPrice);
    // The nearest in-band level on each side (support below, resistance
    // above); the score reads the one of its direction's role
    // (`srMatchForSide`), as the replay does.
    const srMatches = nearestLevelMatchByRole(currentPrice, allLevels, srBandPct);
    const nearSupportResistance = srMatches.support !== null || srMatches.resistance !== null;

    // The bars above are what the verdict is computed on, and on the free feed
    // they are ~15 minutes old — a full candle on the 15-minute execution
    // timeframe. That is a property of the decision, not of the chart legend.
    const dataLag = decisionLag(
      EXECUTION_TIMEFRAME,
      feedDelayMs(assetClass, provider.isLive),
      marketSession(assetClass) === "regular",
    );

    // Gann's breakaway rule (owner decision 5): a sideways market is Watch
    // context until the entry crosses the range's extreme.
    const breakaway = readBreakaway(entryDaily, gannTrigger);
    // Gann's monthly break warns against a new trade with the trend (PLAN.md
    // item 6, step 3): the same daily chart, the same reading as the replay.
    const monthlyWarning = readMonthlyBreakWarning(entryDaily);
    // Gann's volume Rule 2 (A-VOLUME-03, fork FV7 b): a breakdown after a lower
    // top holds a new long to Watch while it stands, as the replay reads it.
    const distributionStanding = readDistributionStanding(sessions, sessionNoon);
    // A-LEVELS-04 (fork FL3 a): the same 52-week entry chart the replay reads.
    const failedTops = readMultipleTops(charts.daily);
    // Gann's selection rules (A-SELECTION-02/-03): early leaders first in the
    // lists. Read as `readDisclosedRules` reads it on the replay: the level
    // charts' daily and monthly, and the market's.
    const leadership = readLeadership(charts.daily, marketDaily, campaignLedger, { stock: charts.monthly, market: marketMonthly });
    // A-SELECTION-04: a weak stock in a bull market ranks last as a buy, first
    // as a short, and a buy in it holds to Watch.
    const weakStock = readWeakStockFrom(charts.monthly, charts.daily, marketMonthly, marketDaily);

    // A breached stop retires the plan (owner decision, 2026-09-30): price the
    // scan ran at is already through the stop of the plan it just priced, or
    // broke it earlier in the session without closing back through it by the
    // allowance. The plan is over until Gann's failed-break test passes or a new
    // plan replaces it. Outermost, so it lands whatever the other holds did. See
    // lib/gann/stopBreach.ts.
    // The session's own closed bars are what tell a poke that reversed by the
    // close from a break: a plan broken earlier today stands again only once a
    // bar has closed back through the level by Gann's 3-point allowance.
    const stopBreach = readStopBreach({
      direction: entrySource?.direction ?? "none",
      stopLoss: levels?.stopLoss,
      price: currentPrice,
      sessionBars: closedExecutionBars.filter((b) => etDateKey(new Date(b.t)) === sessionDay),
    });

    // The rules the nine pillars read (lib/scoring/pillars.ts), read once and
    // shared with the confluence card below, as the replay reads them.
    const instrumentFacts = instrumentReference
      ? { ...instrumentReference, marketDaily, monthly: charts.monthly, monthlyLong, marketMonthly }
      : marketDaily
        ? { sharesOutstanding: null, inception: null, marketDaily, monthly: charts.monthly, monthlyLong, marketMonthly }
        : null;
    const disclosedRules = readDisclosedRules(charts.daily, currentPrice, instrumentFacts, sessionNoon, new Date());
    const pillarFacts = readPillarFacts({
      rules: disclosedRules,
      daily: charts.daily,
      monthly: charts.monthly,
      marketDaily: marketDaily ?? null,
      universe: assetClass === "us_equity" ? { symbol, strength: universeStrength } : null,
      oldLevels: structural.old,
      price: currentPrice,
      // The session's noon UTC, as the replay reads it: the wall clock cut to
      // a UTC date runs a day ahead after 8 PM New York time and reads the
      // month in progress as closed on its last evening (review finding F-03).
      asOf: sessionNoon,
    });
    let windowTurnRead: { turn: ReturnType<typeof readWindowTurn> } | null = null;
    const windowTurn = () => {
      windowTurnRead ??= { turn: readWindowTurn(charts.daily, scoreDirection, monthlyYearCount ?? monthlyLong ?? charts.monthly, undefined, instrumentReference ? { inception: instrumentReference.inception, name: instrumentReference.name } : null) };
      return windowTurnRead.turn;
    };

    const decision = withDecisionState(applyStandAsideHold(applyStopBreachHold(applyDataLagHold(
      applyFigureCrossingHold(applyWeakStockHold(applyRuleFollowingHold(applyTimeWindowHold(applyFailedTopHold(applyDistributionBreakdownHold(applyMonthlyBreakHold(applyBreakawayHold(
        computeScore({
          direction: scoreDirection,
          macroTrends: [monthlyTrend, weeklyTrend, dailyTrend],
          hourlyTrend,
          swingChart,
          campaignLeg,
          ruleOfThree,
          ruleOfThreeWeekly,
          ruleOfThreeMonthly,
          timePriceSquare,
          volumeClimax,
          boilingPoint,
          gann,
          nearSupportResistance,
          srMatch: (() => {
            const m = srMatchForSide(srMatches, scoreDirection);
            return m && { ...m, role: levelRole(currentPrice, m.price), testCount: countLevelTests(sessions, m.price, srBandPct) };
          })(),
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
          pillarFacts,
        }), breakaway), monthlyWarning, scoreDirection), distributionStanding, scoreDirection), failedTops, scoreDirection, levels),
        // Q19: a counter-trend Execute needs its turn to come on a dated window
        // (lib/gann/timeWindow.ts), read on the replay's chart, and only when needed.
        setupKind,
        windowTurn,
      ),
        // Q24: leave queer-acting stocks alone (A-SELECTION-01), on the chart the replay reads.
        readRuleFollowing(charts.daily),
      ), weakStock, scoreDirection),
        // A-LEVELS-08: the first and second times through a round number hold.
        figureCrossingOf(charts.daily, gannTrigger)),
      dataLag,
    ), stopBreach), standAside), direction);

    // ---- Signal and Regime Engine (lib/signals) — a separate decision layer
    // from the Gann/STRAT verdict above, never merged into it. This is a
    // symbol-only scan with no specific account in scope, so the account-only
    // gates (sizing, correlation, cooldown, total open risk) are optimistic
    // placeholders — see `accountContextAssumed` on the returned verdict and
    // `lib/signals/scanGates.ts`. Callers with a real account (e.g. Guided
    // Decision Mode) should treat `tradeable` here as informational only.
    const marketGates = buildScanMarketGates({
      liquidity: liquidity ?? null,
      liquidityOk: meetsLiquidityFloor(liquidity ?? null, assetClass).ok,
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
        dataLagged: dataLag.holdsExecute,
        scannedAt,
      },
      universeThresholds,
    );
    // A scheduled report on the session is a turn date, context only (A-TIME-36).
    const regime = classifyRegime({ bars: sessions, scheduledReportDay: isScheduledReportDay(symbol.toUpperCase(), new Date(scannedAt)) });

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
          // The level charts' daily and monthly, as the replay reads them.
          dailyBars: charts.daily,
          currentPrice,
          direction: scoreDirection,
          instrument: instrumentFacts,
          disclosedRules,
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
            htfBars: sessions,
            executionBars: closedExecutionBars,
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
            htfBars: sessions,
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
            htfBars: sessions,
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
            htfBars: sessions,
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
      selectionStrength: selectionStrength(direction, leadership, weakStock, pillarFacts.universeRank),
      ...(stopBreach.breached
        ? { stopBreach: { stop: stopBreach.stop!, price: stopBreach.price!, reclaimAt: stopBreach.reclaimAt! } }
        : {}),
      dataLag,
      executionBar: closedExecutionBars[closedExecutionBars.length - 1],
      decision,
      setAsideEntry,
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
      // A day's range for the resting-order list (lib/setups/resting.ts).
      dayRange: recentAtr > 0 ? recentAtr : null,
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
      decision: withDecisionState({ score: 0, outputState: "Reject", breakdown: [] }, "none"),
      error: view.message,
      errorCode: view.code,
    };
  }
}

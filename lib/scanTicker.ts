/**
 * GSPS scan pipeline — the top-down flow from the Premise doc:
 *   10yr/5yr/1yr trend + S/R  →  1hr refinement  →  15min precision entry
 * with structural confluence (fans, harmonic levels, time cycles) and reversal-pattern
 * execution mechanics, producing entry / SL / TP1 / master profit + score /9.
 */

import type {
  AssetClass,
  GannLevels,
  ScanDecision,
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
import { levelRole } from "@/lib/analysis/levelRole";
import { computeFanLines } from "@/lib/gann/fans";
import { recentSquareOf9Levels } from "@/lib/gann/squareOf9";
import { timeCycles } from "@/lib/gann/timeCycles";
import { computeAngleSlopes } from "@/lib/gann/normalizedSlope";
import { computeRetracementLevels } from "@/lib/gann/retracement";
import { priceTimeConfluence } from "@/lib/gann/digitalRoot";
import { computeSwingChart } from "@/lib/gann/swingChart";
import { computeTimePriceSquare } from "@/lib/gann/timePriceSquare";
import { computeVolumeClimax } from "@/lib/gann/volumeClimax";
import { adx } from "@/lib/signals/indicators";
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
 * What the caller is looking for. Left unset, a scan has no direction opinion
 * of its own: it prices and scores the best-armed pattern in *each* direction
 * that has one armed, and reports whichever direction's evidence actually
 * wins (see `evaluateCandidate`/`pickWinner` below) — reversion and
 * continuation are two hypotheses judged on their own merits, not a default
 * and an exception. The market scan's continuation top-up pass sets this when
 * it has already independently coarse-scored a symbol as a continuation
 * candidate and wants that specific direction re-scanned, so the pattern
 * chosen, the trade plan priced from it, and the macro criterion it is scored
 * on all describe the same trade.
 *
 * 2026-09-11: this replaces a default that assumed every setup was a
 * reversion against the macro trend and used that assumption to pick which
 * armed pattern got scored — see AGENTS.md's cross-platform consistency
 * section for the incident this produced (a short surfaced and traded on
 * IBIT purely because the macro trend read bullish, not because a bearish
 * setup had better evidence than the bullish continuation also armed at the
 * time).
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

    if (daily.length < 30 || execution.length < 10) {
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
    // Computed here (rather than down with the rest of the Signal & Regime
    // Engine block) because it doubles as the neutral, evidence-based
    // fallback direction below when no STRAT pattern is armed in either
    // direction — an ADX/DMI trend read, not an assumed mean reversion.
    const regime = classifyRegime({ bars: daily });

    // ---- Level 2: 1hr refinement
    const hourlyTrend = readTrend(hourly, "1Hour");
    // Same implementation and 20-ADX threshold lib/signals/regime.ts already
    // validated for trend-strength confirmation — reused, not reinvented.
    const hourlyAdx = adx(hourly);

    // ---- Gann structures (anchored on the daily chart)
    const fanLines = computeFanLines(daily, currentPrice);
    const s9 = recentSquareOf9Levels(daily, currentPrice).slice(0, 12);
    const cycles = timeCycles(daily);
    const angleSlopes = computeAngleSlopes(daily, currentPrice);
    // Gann's squaring of price and time, replacing timeCycle — same anchors
    // as angleSlopes, a different (raw count-for-count) construction.
    const timePriceSquare = computeTimePriceSquare(daily, currentPrice);
    // Volume climax at the same pivots, replacing harmonicProximity.
    const volumeClimax = computeVolumeClimax(daily);
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
      angleSlopes,
      retracementLevels: retracementLevels.slice(0, 7).map(({ fraction, label, price, distancePct, role }) => ({
        fraction,
        label,
        price: Math.round(price * 100) / 100,
        distancePct,
        role,
      })),
      digitalRootConfluences,
    };

    // ---- Level 3: 15min precision entry via reversal patterns (closed bars only)
    const closedExecutionBars = execution.slice(0, -1); // treat the final bar as potentially live
    // The execution-timeframe ATR sets the noise floor a setup's stop has to
    // clear; without it a narrow bar arms a pattern no one could actually hold.
    const executionAtr = atr(closedExecutionBars.slice(-30), 14);
    const armed = detectPatterns(closedExecutionBars).filter(
      (p) => !gapRuleViolated(p, currentPrice) && !riskFloorViolated(p, executionAtr),
    );

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
    // direction of the bar sequence; the 2-2 family reverses it. Rank the
    // continuation shapes first only when one was explicitly asked for, so
    // the trade plan priced below is the continuation's.
    const kindRank = (p: StratPattern): number =>
      setupKind === "continuation" && !CONTINUATION_PATTERNS.has(p.name) ? 1 : 0;

    /**
     * The strongest-armed candidate *within one direction*: shape first (only
     * when a continuation was explicitly asked for), then specificity, then
     * trigger proximity to current price. Direction is never a tie-break
     * input here — see the bullish/bearish evaluation below for how the two
     * directions are actually adjudicated against each other.
     */
    const bestArmedPattern = (dir: "bullish" | "bearish"): StratPattern | null => {
      const candidates = armed.filter((p) => p.direction === dir);
      if (candidates.length === 0) return null;
      return [...candidates].sort((a, b) => {
        const kind = kindRank(a) - kindRank(b);
        if (kind !== 0) return kind;
        const spec = specificity(a.name) - specificity(b.name);
        if (spec !== 0) return spec;
        return Math.abs(a.triggerPrice - currentPrice) - Math.abs(b.triggerPrice - currentPrice);
      })[0];
    };

    // ---- Trade levels — direction-agnostic inputs, shared by every candidate
    // evaluated below (reversion and continuation alike).
    const previousBar = closedExecutionBars[closedExecutionBars.length - 2] ?? closedExecutionBars[closedExecutionBars.length - 1];
    const gannTargets = [
      ...gann.fanLines.map((f) => f.price),
      ...gann.squareOf9.map((s) => s.price),
    ];
    // Read once, shared by the large-cap check below and the `liquidity` field
    // on the returned result — same daily bars either way, no reason to read
    // them twice.
    const liquidity = readLiquidity(daily) ?? undefined;
    const largeCap = isLargeCapStock(symbol, assetClass, liquidity);

    // ---- Supporting signals — also direction-agnostic; role-awareness for
    // S/R (which side of a level a trade needs) happens inside computeScore
    // via the direction it's called with, not here.
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

    const criterionWeights = await getActiveCriterionWeights();

    interface Candidate {
      pattern: StratPattern | null;
      direction: "bullish" | "bearish";
      levels: TradeLevels | null;
      levelsError: string | undefined;
      decision: ScanDecision;
    }

    /**
     * Price and score one direction's candidate — a specific armed pattern,
     * or `null` with a fallback direction when nothing is armed. Reversion
     * and continuation are two hypotheses, not a default and an exception:
     * this runs identically either way, off the same shared context above,
     * so whichever direction actually clears the bar wins on its own
     * evidence rather than on an assumption about which one "should" apply.
     */
    const evaluateCandidate = (
      candidatePattern: StratPattern | null,
      candidateDirection: "bullish" | "bearish",
    ): Candidate => {
      let candidateLevels: TradeLevels | null = null;
      let candidateLevelsError: string | undefined;
      // A trade-plan failure is confined to the trade plan. The rest of the
      // scan — price, trends, structural levels, checklist — is still valid
      // and worth showing, so it degrades to "no levels" with a note instead
      // of collapsing the whole scan into an error and leaving the ticker
      // page blank.
      if (candidatePattern) {
        try {
          candidateLevels = computeTradeLevels(
            candidatePattern,
            previousBar,
            gannTargets,
            optionPremium,
            executionAtr,
            assetClass,
            largeCap,
          );
        } catch (err) {
          candidateLevelsError = err instanceof Error ? err.message : String(err);
        }
      }

      const candidateDecision = applyDataLagHold(
        applyReversionConfirmation(
          computeScore({
            direction: candidateDirection,
            macroTrends: [monthlyTrend, weeklyTrend, dailyTrend],
            hourlyTrend,
            hourlyAdx,
            swingChart,
            timePriceSquare,
            volumeClimax,
            gann,
            nearSupportResistance,
            srMatch: srMatch && { ...srMatch, role: levelRole(currentPrice, srMatch.price) },
            pattern: candidatePattern,
            momentumElevated,
            levels: candidateLevels,
            stopAtrMultiple:
              candidateLevels && executionAtr > 0 ? candidateLevels.riskPerShare / executionAtr : null,
            setupKind,
            atrPct,
            weights: criterionWeights,
          }),
          candidatePattern,
          momentumElevated,
          nearSupportResistance,
        ),
        dataLag,
      );

      return {
        pattern: candidatePattern,
        direction: candidateDirection,
        levels: candidateLevels,
        levelsError: candidateLevelsError,
        decision: candidateDecision,
      };
    };

    // Execute beats Watch beats Reject; within a tier, higher score wins;
    // remaining ties fall back to the same specificity/proximity tie-break
    // `bestArmedPattern` uses within a single direction. Only ever called
    // with candidates carrying a real armed pattern (never the null-pattern
    // fallback), so the non-null pattern access below is safe.
    const tierRank = (d: ScanDecision): number =>
      d.outputState === "Execute" ? 2 : d.outputState === "Watch" ? 1 : 0;
    const pickWinner = (candidates: Candidate[]): Candidate | null => {
      if (candidates.length === 0) return null;
      return [...candidates].sort((a, b) => {
        const tier = tierRank(b.decision) - tierRank(a.decision);
        if (tier !== 0) return tier;
        if (b.decision.score !== a.decision.score) return b.decision.score - a.decision.score;
        const spec = specificity(a.pattern!.name) - specificity(b.pattern!.name);
        if (spec !== 0) return spec;
        return Math.abs(a.pattern!.triggerPrice - currentPrice) - Math.abs(b.pattern!.triggerPrice - currentPrice);
      })[0];
    };

    // A caller with no direction opinion has no pattern armed to fall back
    // to either, so it reads the regime engine's own ADX/DMI trend read
    // instead of assuming a reversion against the macro trend — "bullish" is
    // an arbitrary, inert placeholder for the rare case regime is sideways
    // too (no pattern anywhere means no trade plan either way).
    const noOpinionFallbackDirection: "bullish" | "bearish" =
      regime.direction !== "sideways" ? regime.direction : "bullish";

    const winner: Candidate = preference
      ? // An explicit ask (e.g. marketScan's continuation top-up) already
        // decided, from its own independent coarse score, which direction it
        // wants re-scanned — honor it rather than re-adjudicating here.
        evaluateCandidate(bestArmedPattern(preference.direction), preference.direction)
      : // No caller opinion: reversion and continuation are two hypotheses,
        // not a default and an exception (see the `ScanPreference` doc
        // comment above and AGENTS.md's cross-platform consistency section
        // for the incident this replaces). Score whichever pattern each
        // direction actually armed and let the evidence decide.
        pickWinner(
          ([bestArmedPattern("bullish"), bestArmedPattern("bearish")] as (StratPattern | null)[])
            .filter((p): p is StratPattern => p !== null)
            .map((p) => evaluateCandidate(p, p.direction)),
        ) ?? evaluateCandidate(null, noOpinionFallbackDirection);

    const pattern: StratPattern | null = winner.pattern;
    const levels: TradeLevels | null = winner.levels;
    const levelsError: string | undefined = winner.levelsError;
    const direction: "bullish" | "bearish" | "none" = pattern?.direction ?? "none";
    const scoreDirection = winner.direction;
    const decision = winner.decision;

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
    // `regime` is computed earlier (see the comment by its declaration) —
    // it's also this scan's fallback direction when nothing armed.

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
      // Every setup armed on the execution timeframe, in both directions,
      // regardless of which one `pattern` ended up being — see
      // `lib/types.ts`'s doc comment on this field. Unsorted: consumers
      // (`SignalCard`'s "other setups armed" list, `marketScan.ts`'s
      // continuation-shape check) don't care about order, only membership.
      armedPatterns: armed,
      levels,
      levelsError,
      dataLag,
      executionBar: closedExecutionBars[closedExecutionBars.length - 1],
      decision,
      // Read off the same daily bars the structure was computed from, so any
      // consumer can apply the platform-wide liquidity floor without a second
      // fetch — see lib/scan/liquidity.ts.
      liquidity,
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

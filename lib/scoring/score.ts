/**
 * The Score out of `TOTAL_POINTS` (9): one point per pillar since 2026-10-17
 * (`lib/scoring/pillars.ts`), each built from several of the method's checks,
 * weighted by `CriterionWeights`. The nine criteria scored before that date
 * stay in the breakdown as checks (`checkOf`), scoring nothing alone.
 * Execute at `EXECUTE_SCORE_THRESHOLD`+, Watch at `WATCH_SCORE_THRESHOLD`+,
 * Reject below — see those constants' own comments for the current values
 * and why; this header stopped restating the literal numbers after they
 * drifted from a stale "7–9/4–6/0–3" copy left behind by the 2026-09-14
 * stopgap.
 */

import type { BreakawayReading } from "@/lib/gann/breakaway";
import type { MonthlyBreakWarning } from "@/lib/gann/campaignLedger";
import type { DistributionStanding } from "@/lib/gann/distribution";
import { failedTestInPath, type MultipleTopsReading } from "@/lib/gann/multipleTops";
import type { StopBreachReading } from "@/lib/gann/stopBreach";
import { needsWindowTurn, type WindowTurn } from "@/lib/gann/timeWindow";
import {
  activityPillar,
  anglesPillar,
  definiteIndicationPillar,
  marketCyclePillar,
  priceLevelsPillar,
  relativeStrengthPillar,
  timePillar,
  trendPillar,
  volumePillar,
  type PillarFacts,
  type PillarResult,
} from "@/lib/scoring/pillars";
import type { RuleFollowingReading } from "@/lib/gann/ruleFollowing";
import type { WeakStockReading } from "@/lib/gann/leadership";
import { LOWEST_RANK } from "@/lib/gann/retracement";
import { FIGURE_BUY_TIME, type FigureCrossingReading } from "@/lib/gann/evenFigures";
import type {
  AssetClass,
  GannLevels,
  ScanDecision,
  ScoreBreakdownItem,
  SetupKind,
  StratPattern,
  Timeframe,
  TradeLevels,
  TrendReading,
} from "@/lib/types";
import {
  LEVEL_BAND_BASIS,
  levelBandPct,
} from "@/lib/scoring/proximity";
import { LEVEL_TIMEFRAME_USAGE, levelRoleLabel, levelTestConfidence, type LevelRole } from "@/lib/analysis/levelRole";
import { PATTERN_GLOSSARY_TERM } from "@/lib/education/patterns";
import type { CampaignLegReading, SwingChartReading } from "@/lib/gann/swingChart";
import type { RuleOfThreeReading } from "@/lib/gann/ruleOfThree";
import type { TimePriceSquareReading } from "@/lib/gann/timePriceSquare";
import type { VolumeClimaxReading } from "@/lib/gann/volumeClimax";
import type { BoilingPointReading } from "@/lib/gann/boilingPoint";
import {
  DEFAULT_CRITERION_WEIGHTS,
  EXECUTE_SCORE_THRESHOLD,
  WATCH_SCORE_THRESHOLD,
  type CriterionKey,
  type CriterionWeights,
} from "@/lib/scoring/weights";
import type { DecisionLag } from "@/lib/data/latency";
import { priorYearLevelName, regainedLevelName } from "@/lib/scoring/direction-copy";

export interface ScoreInputs {
  direction: "bullish" | "bearish";
  macroTrends: TrendReading[]; // monthly/weekly/daily
  hourlyTrend: TrendReading;
  /**
   * Gann's 3-Day Chart and 7-day weekly swing chart off the daily highs and
   * lows (`lib/gann/swingChart.ts#computeSwingChart`). Null on either chart
   * until it has signalled a trend (crossed its last swing top or broken its
   * last swing bottom), which scores as a fail.
   */
  swingChart?: SwingChartReading | null;
  /**
   * Gann's "sections of a campaign" leg count off the same daily bars
   * (`lib/gann/swingChart.ts#computeCampaignLeg`) — how many 3-day
   * swing-chart legs have printed since the weekly chart's last trend change, and
   * whether that count falls in his disclosed 3-4-leg reversal zone.
   * Confluence/context only: appended to `swingChartTrend`'s explanation
   * note, never affecting `passed` — a materially different construction
   * from `swingChartAligned` itself, so it stays out of the scored boolean
   * until backtested on its own, per this codebase's evidence-gating
   * discipline.
   */
  campaignLeg?: CampaignLegReading | null;
  /**
   * Gann's "Rule of Three" off the daily closes
   * (`lib/gann/ruleOfThree.ts#computeRuleOfThree`) — see that module's
   * header for the generalization from his literal reversal-only rule to
   * both reversion and continuation setups. Undefined/empty scores as a
   * fail the same way a missing swing-chart reading does.
   */
  ruleOfThree?: RuleOfThreeReading | null;
  /**
   * The same rule on weekly and monthly closes. Gann applies the Rule of
   * Three to the weekly and monthly charts as well as the daily (*Wall Street
   * Stock Selector*, 1930, p. 72). Added 2026-09-27 (parity roadmap A7, owner
   * direction to implement Gann's method throughout): the criterion passes
   * when the rule fires in the trade's direction on any of the three charts.
   */
  ruleOfThreeWeekly?: RuleOfThreeReading | null;
  ruleOfThreeMonthly?: RuleOfThreeReading | null;
  /**
   * Gann's squaring of price and time off the daily bars
   * (`lib/gann/timePriceSquare.ts#computeTimePriceSquare`) — bars elapsed
   * since the direction-matched swing pivot (low for bullish, high for
   * bearish) checked against the price move since that pivot measured in
   * 14-bar ATRs, one ATR per day (an engineering unit, not Gann's raw point).
   * A different question from `gannAngleSlope`'s rate of change. Empty when there isn't enough daily history to find a
   * pivot, which scores as a fail.
   */
  timePriceSquare?: TimePriceSquareReading[];
  /**
   * Volume climax at the direction-matched swing pivot off the daily bars
   * (`lib/gann/volumeClimax.ts#computeVolumeClimax`) — the pivot's own
   * relative volume against its trailing lookback, reusing
   * `lib/signals/indicators.ts`'s `relativeVolume()` and the `>1.5x`
   * "unusual volume" threshold `lib/signals/regime.ts` already validated.
   * Empty when there isn't enough daily history to find a pivot or price
   * its volume, which scores as a fail.
   */
  volumeClimax?: VolumeClimaxReading[];
  /**
   * "Boiling point" blow-off duration off the same climax anchors
   * (`lib/gann/boilingPoint.ts#computeBoilingPoint`) — how many weeks have
   * elapsed since a detected climax, classified against the disclosed
   * 6-7-week (rarely past 10) exhaustion window. Confluence/context only:
   * appended to `volumeClimax`'s explanation note, never affecting
   * `passed` — stays out of the scored boolean until backtested on its
   * own, per this codebase's evidence-gating discipline.
   */
  boilingPoint?: BoilingPointReading[] | null;
  /**
   * `hourlyAdx` was accepted here until 2026-09-16, when `adxTrendStrength`
   * was removed from the scorecard entirely (project owner direction — see
   * `lib/scoring/weights.ts`'s `CRITERION_KEYS` and the RETIRED entry in
   * `lib/validation/criteria-registry.ts`). Unlike `momentum` below, the
   * field is gone rather than kept-but-unread: nothing else in this module
   * reads ADX. (`lib/signals/indicators.ts#adx` outlived it by a day: its
   * last two callers, `lib/signals/regime.ts` and
   * `lib/signals/states/rangeReversion.ts`, moved to
   * `lib/gann/trendStrength.ts` on 2026-09-17, and `adx()` was deleted on
   * 2026-09-25.)
   */
  gann: GannLevels;
  nearSupportResistance: boolean;
  /**
   * The clustered swing level `nearSupportResistance` matched, if any, plus
   * the timeframe it was read off and its role at current price. Optional so
   * callers that only have the boolean (the backtest replay, existing tests)
   * keep working — the note just falls back to the generic wording.
   */
  srMatch?: { price: number; timeframe: Timeframe; role: LevelRole; testCount?: number } | null;
  pattern: StratPattern | null;
  /**
   * The armed entry trigger, from `lib/gann/entryTrigger.ts` — crossing an old
   * swing top/bottom plus the 3-point allowance. Replaced `pattern` as
   * what arms and prices a trade on 2026-09-17; `pattern` stays for the
   * display/confluence role only. Null means nothing is armed.
   */
  gannTrigger?: {
    triggerPrice: number;
    stopPrice: number;
    direction: "bullish" | "bearish";
    kind?: "crossing" | "oldLevel" | "hold";
    level?: number;
    tests?: number;
    /** `hold` only: which of Gann's hold rules found the bottom. */
    holdBasis?: "weeks" | "days" | "record" | "rally" | "narrowWeek";
    source?: "swing" | "priorYear" | "allTime";
    regained?: true;
    /** A previous year's level: its year. */
    levelYear?: number;
    newRecord?: boolean;
  } | null;
  /**
   * Accepted but no longer read here: `momentum` stopped being a scored
   * criterion on 2026-09-08 (see the `stopRoom` swap, itself replaced by
   * `stopBehindOldLevel` on 2026-10-16, in
   * `lib/scoring/weights.ts`), and the bare-2-2 hold it fed was removed on
   * 2026-10-16 (N#1). Nothing on the verdict path reads it; the field stays
   * so the callers' inputs objects keep one shape.
   */
  momentumElevated: boolean;
  /**
   * The setup's stop distance as a multiple of the execution ATR. Accepted
   * but no longer read: the stop point is Gann's old level 3 points in front
   * of the stop since 2026-10-16 (Q23). The field stays so callers keep one
   * shape.
   */
  stopAtrMultiple?: number | null;
  levels: TradeLevels | null;
  /** The instrument's asset class. The stop point reads the same rule on every class (Q23). */
  assetClass?: AssetClass;
  /** Defaults to "reversion" — the protocol's primary setup. */
  setupKind?: SetupKind;
  /**
   * Daily ATR as a percentage of price. Accepted but no longer read here:
   * since 2026-10-16 "at a level" is Gann's 3-point allowance
   * (`levelBandPct`, N#27). The field stays so callers keep one shape.
   */
  atrPct?: number;
  /**
   * Per-criterion weights, keyed by the stable id each breakdown item carries
   * rather than its display text, so rewording a criterion cannot detach its
   * weight. Defaults to one point each, which is what the score has always been. A
   * weight set from `lib/backtest/propose-weights.ts` sums to the same 9 points,
   * so the Execute/Watch cutoffs keep their meaning.
   */
  weights?: CriterionWeights;
  /**
   * The readings the nine pillars need beyond the checks above
   * (`lib/scoring/pillars.ts#readPillarFacts`), built the same way on the live
   * scan and the replay. Absent, the pillars that need them fail.
   */
  pillarFacts?: PillarFacts | null;
}

/** Plain-language read of Gann's volume rule at the anchor (see `lib/gann/volumeClimax.ts`). */
export function volumeNote(r: VolumeClimaxReading): string {
  const at = `The ${r.anchorKind} at ${r.anchorPrice.toFixed(2)}`;
  if (r.anchorKind === "low") {
    if (r.dryingUp) return `${at} came on shrinking volume and a narrowing range: liquidation running its course, the normal bottom.`;
    if (r.retestOnLowerVolume) return `${at} retested the previous low on smaller volume: liquidation is over.`;
    if (r.secondaryOnLowerVolume) return `${at} is a higher secondary low on less volume than the first advance, and the advance after it is heavier: higher prices ahead.`;
    if (r.panicSecondary) return `${at} is a secondary low after a selling climax, on half its volume or less: the panic has run its course.`;
    if (r.volumeExtremeLow) return `${at} comes with the smallest monthly volume in five years: a sign of bottom.`;
    if (r.climax) return `${at} came on ${r.bestRecentRelativeVolume.toFixed(2)}x trailing volume: a selling climax, the panic-bottom exception.`;
    return `${at} came on neither shrinking volume nor a selling climax (${r.bestRecentRelativeVolume.toFixed(2)}x trailing volume at best).`;
  }
  if (r.retestOfHeavyTop) return `${at} is a second test of a top that came on heavy volume: a sign to sell.`;
  if (r.climax) return `${at} came on ${r.bestRecentRelativeVolume.toFixed(2)}x trailing volume: tops come on heavy sales.`;
  if (r.retestOnLowerVolume) return `${at} is a secondary top on smaller volume than the one before: the advance is tiring.`;
  if (r.secondaryOnLowerVolume) return `${at} is a lower secondary rally on smaller volume, after a decline on heavy volume: the final top may be in.`;
  if (r.heavyAdvance) return `${at} came after the heaviest week since the last top: the largest volume often comes before the final top.`;
  return `${at} came on ordinary volume (${r.bestRecentRelativeVolume.toFixed(2)}x trailing at best): no sign of distribution yet.`;
}

/** What the crossing crosses, in the criterion's note (PLAN.md item 5, step 3). */
/** The armed note for a bottom (top) that has held (PLAN.md item 5, step 4). */
function heldNote(t: NonNullable<ScoreInputs["gannTrigger"]>): string {
  const up = t.direction === "bullish";
  const at = (t.level ?? t.triggerPrice).toFixed(2);
  if (t.holdBasis === "narrowWeek") {
    return `Trigger armed bearish: a narrow week was followed by a sharp drop on large volume, which turns the trend down, so a sell rests 1 point under that week's low at ${at}, for the bounce, with the stop 3 points over it.`;
  }
  if (t.holdBasis === "rally") {
    return `Trigger armed bearish: a rally in a falling market has run to the end of its second or third week, so the entry rests at the last close with the stop 3 points over that week's high at ${at}.`;
  }
  const what =
    t.holdBasis === "record"
      ? `the record low at ${at} has held for weeks without a 3-point break`
      : t.holdBasis === "days"
        ? `the low at ${at} has held two days after a two-to-three-week reaction in a bull market`
        : `the ${up ? "low" : "high"} at ${at} has held into its second week`;
  return `Trigger armed ${t.direction}: ${what}, so the entry rests at the last close with the stop 3 points ${up ? "under" : "over"} it.`;
}

function crossedLevelName(source: "swing" | "priorYear" | "allTime" | undefined, direction: "bullish" | "bearish", levelYear?: number): string {
  const up = direction === "bullish";
  if (source === "priorYear") return priorYearLevelName(up, levelYear);
  if (source === "allTime") return up ? "the record high before the last 52 weeks" : "the record low before the last 52 weeks";
  return "the last completed swing level";
}

/** A regained old bottom (lost old top), A-TREND-10: what the arming close did. */
function regainedNote(t: { direction: "bullish" | "bearish"; source?: "swing" | "priorYear" | "allTime"; levelYear?: number }): string {
  const up = t.direction === "bullish";
  const name = regainedLevelName(up, t.source === "swing" ? undefined : t.source, t.levelYear);
  return `is 3 points back ${up ? "over" : "under"} ${name} after a 3-point break ${up ? "under" : "over"} it`;
}

export function computeScore(inputs: ScoreInputs): ScanDecision {
  const {
    direction, swingChart, campaignLeg, ruleOfThree, ruleOfThreeWeekly = null, ruleOfThreeMonthly = null, timePriceSquare, volumeClimax, boilingPoint, gann,
    nearSupportResistance, srMatch, pattern, gannTrigger = null, levels,
    setupKind = "reversion",
    weights = DEFAULT_CRITERION_WEIGHTS,
    pillarFacts = null,
  } = inputs;

  // 2026-09-10: replaces macroTrend. macroTrend's monthly/weekly/daily
  // 2-of-3 agreement measured negligible (inside the ±0.1R noise band on
  // both adequately sampled arms — see lib/validation/criteria-registry.ts's
  // `macroTrend` RETIRED entry) after its counter-trend premise was already
  // corrected once. Gann's swing charts are a different construction on the
  // same daily bars, so both must agree with the trade's own direction, not
  // just with each other. Since 2026-09-27 they are Gann's own charts: the
  // 3-Day Chart (A09 Ch. VII) and the 7-day weekly chart (A8 1951), built on
  // highs and lows, with the trend turning on a break of the last swing
  // extreme. See lib/gann/swingChart.ts.
  const swingChartAligned =
    swingChart != null &&
    swingChart.threeDay === direction &&
    swingChart.weekly === direction;

  // Added 2026-09-16: Gann's "Rule of Three" (see lib/gann/ruleOfThree.ts's
  // header for the exact rule and its generalization to both reversion and
  // continuation setups). A bullish call reads the downtrend-reversal mirror
  // (>= 3 consecutive higher closes); a bearish call reads the uptrend rule
  // (>= 3 consecutive lower closes). Gann's count is 3 both ways (M-R3,
  // 2026-10-16; the bullish count was 2 before).
  const fires = (r: RuleOfThreeReading | null | undefined): boolean =>
    r != null && (direction === "bullish" ? r.bullishSignal : r.bearishSignal);
  const ruleOfThreeDaily = fires(ruleOfThree);
  const ruleOfThreeHigher = fires(ruleOfThreeWeekly)
    ? "weekly"
    : fires(ruleOfThreeMonthly)
      ? "monthly"
      : null;
  const ruleOfThreeHolding = ruleOfThreeDaily || ruleOfThreeHigher !== null;

  // Null (no priced plan) fails: a setup with no stop has no room to measure,
  // and the alternative — treating "unknown" as a pass — would hand a free
  // point to exactly the setups that are least ready to trade.
  //
  // Gann's stop rule (owner, Q23, 2026-10-16): the stop sits 3 points beyond
  // an old top or bottom (W006 pp.20-24, 46-47), so the point asks whether an
  // old level stands 3 points in front of it, on every asset class. It
  // replaced `stopRoom` (a 1.5x ATR multiple, or "anchored to S/R" for
  // stocks), which had no source.
  const stopBehindOldLevel = levels?.stopBehindOldLevel === true;


  // A structural level only confirms a trade when it's on the *right side* of
  // it — a long wants a support floor underneath, a short wants a resistance
  // ceiling overhead. The opposite level is a headwind, not confluence, so
  // proximity alone (the old check) awarded the point identically whether the
  // level helped the trade or fought it. `role` was already computed for
  // every level (see lib/analysis/levelRole.ts) and used only in rationale
  // text — never in the pass/fail logic — until now.
  //
  // Each array is already sorted nearest-first, but the single nearest entry
  // is frequently the wrong role — searching for the nearest entry *of the
  // wanted role* within the band finds real confluence a farther-but-still
  // in-band level would otherwise miss, rather than failing the whole
  // criterion just because the literal closest line happens to be on the
  // wrong side.
  const wantedRole: LevelRole = direction === "bullish" ? "support" : "resistance";

  // Which anchor bears on this trade's own direction: a bullish setup reads
  // the angle rising from the most recent low underneath it, a bearish
  // setup the angle falling from the most recent high above it — same
  // convention `wantedRole` already uses for fan/S9 matches.
  const angleAnchorKind: "low" | "high" = direction === "bullish" ? "low" : "high";
  const angleReading = gann.angleSlopes.find((r) => r.anchorKind === angleAnchorKind) ?? null;
  // Loosened 2026-09-11: requiring the realized slope's nearest angle to be at
  // or steeper than the literal 1x1 (ratio >= 1) was confirmed starved on two
  // independent, large-sample unconditioned runs (2.2% of 1049 trades at
  // 15Min, 1.9% of 10472 at 1Hour — see lib/validation/criteria-registry.ts's
  // gannAngleSlope entry) and, on the larger sample, also measured a
  // significant inversion when it did fire. ANGLES (lib/gann/fans.ts) already
  // defines a full family of Gann angles down to 1x2 (ratio 0.5); requiring
  // 1x1-or-steeper picked the single steepest "trend-confirming" rung of that
  // ladder for no measured reason. Now accepts 1x2-or-steeper — the next rung
  // down — as "holding a Gann angle", moving the way the trade needs it to.
  // This is a design change made on the strength of two confirming runs, not
  // a hypothesis pending a third: see the registry entry for why a further
  // measurement was not the next step. Needs its own fresh replay once
  // committed, same as any other scoring change.
  const angleHolding =
    angleReading?.nearestAngle != null &&
    angleReading.nearestAngle.ratio >= 0.5 &&
    angleReading.nearestAngle.direction === (direction === "bullish" ? "up" : "down");

  // 2026-09-10: replaces timeCycle. timeCycle's projected-anniversary-date
  // approach measured negligible even after fixing its two implementation
  // defects (see lib/validation/criteria-registry.ts's `timeCycle` RETIRED
  // entry). Gann's squaring of price and time is a different construction —
  // bars elapsed since the same direction-matched anchor angleHolding reads,
  // checked one-for-one against the raw price move since it, not the
  // ATR-normalized rate angleHolding tests.
  const squareReading =
    (timePriceSquare ?? []).find((r) => r.anchorKind === angleAnchorKind) ?? null;
  const timePriceSquareHolding = squareReading?.squared === true;

  // 2026-09-10: replaces harmonicProximity. harmonicProximity's Square-of-9
  // price proximity measured negligible even after fixing its stale-anchor
  // defect twice (see lib/validation/criteria-registry.ts's
  // `harmonicProximity` RETIRED entry). A genuinely different signal off the
  // same direction-matched anchor: whether that pivot itself printed on a
  // volume climax, not another price-distance check.
  const climaxReading =
    (volumeClimax ?? []).find((r) => r.anchorKind === angleAnchorKind) ?? null;
  const volumeClimaxHolding = climaxReading?.confirms === true;
  // Confluence/context only — never changes volumeClimaxHolding itself. See
  // ScoreInputs.boilingPoint's own doc comment for why this stays out of
  // the scored boolean.
  const boilingPointReading =
    (boilingPoint ?? []).find((r) => r.anchorKind === angleAnchorKind) ?? null;
  const boilingPointNote = boilingPointReading
    ? ` ${boilingPointReading.weeksSinceClimax} weeks since that climax (${boilingPointReading.phase} — the disclosed exhaustion window is 6-7 weeks, rarely past 10).`
    : "";

  // Gann's percentage-retracement zone (eighths): price within the level's
  // 3-point allowance (N#27, `levelBandPct`).
  const retracementMatch =
    gann.retracementLevels.find((r) => r.role === wantedRole && r.distancePct <= levelBandPct(r.price)) ?? null;
  // Digital-root/vortex reading off the same direction-matched anchor: card
  // context only. Until 2026-10-16 it was ANDed into this point; fork FL5 a
  // removed that, since a class C reading (W011, arithmetic mod 9) may never
  // gate, and Gann's retracement levels (50% first; 45 Years in Wall Street,
  // How to Make Profits in Commodities) score on their own. See
  // lib/gann/digitalRoot.ts's priceTimeConfluence.
  const drReading = gann.digitalRootConfluences.find((r) => r.anchorKind === angleAnchorKind) ?? null;
  const drConfluenceHolds = drReading !== null && drReading.type !== "NO_CONFLUENCE";
  const gannConfluenceStackPassed = retracementMatch !== null;
  // srMatch carries the role of the matched level; older callers that only
  // pass the boolean (no srMatch) keep the pre-fix behavior for this
  // criterion rather than being silently failed by a check they can't answer.
  const historicalSRPassed = srMatch ? srMatch.role === wantedRole : nearSupportResistance;

  // What arms the trade. Was `pattern.direction === direction` off the
  // bar-sequence pattern until 2026-09-17; now the swing-crossing trigger.
  // See `lib/gann/entryTrigger.ts` and AGENTS.md's gate-1 status.
  const patternValid = gannTrigger !== null && gannTrigger.direction === direction;

  // Confluence/context only — never changes swingChartAligned itself. See
  // ScoreInputs.campaignLeg's own doc comment for why this stays out of the
  // scored boolean.
  const campaignLegNote =
    campaignLeg?.legNumber != null && campaignLeg.confidence != null
      ? ` Leg ${campaignLeg.legNumber} of the current campaign since the last major (weekly chart) trend change (${campaignLeg.confidence} confidence — reversals on the 3rd/4th leg are trusted more than the 2nd).`
      : "";

  // Confluence/context only, same treatment as campaignLegNote above — never
  // changes historicalSRPassed itself. Gann's own rule (45 Years in Wall
  // Street, 1949): a level's 4th+ test is markedly less safe than the first
  // three. See lib/analysis/levelRole.ts#levelTestConfidence.
  const levelTestNote =
    srMatch?.testCount != null && srMatch.testCount > 0
      ? ` This is test #${srMatch.testCount} of this level${
          levelTestConfidence(srMatch.testCount) === "caution"
            ? " — the 4th+ test of the same level is historically less safe; it nearly always goes through."
            : "."
        }`
      : "";

  // "TP1 ≥ 2R" could never fail, and so was never a criterion. computeTradeLevels
  // sets TP1 to max(2R, previous candle's extreme), which puts the ratio at 2 or
  // better on every well-formed pattern — a free point on all nine-criteria
  // scores, inflating every verdict by one and discriminating nothing.
  //
  // Scoring TP1's structural branch instead is no better: it is unreachable in
  // practice (zero of 6,362 armed setups) and only mirrors the defect, turning
  // a point nobody could lose into one nobody could win.
  //
  const breakdown: ScoreBreakdownItem[] = [
    {
      key: "swingChartTrend",
      criterion: "3-day/weekly swing chart trend",
      checkOf: "trendAllTimeframes",
      passed: swingChartAligned,
      note:
        swingChart == null || swingChart.threeDay == null || swingChart.weekly == null
          ? "The 3-day and weekly swing charts have not both signalled a trend yet."
          : (swingChartAligned
              ? setupKind === "continuation"
                ? `Both the 3-day and weekly swing charts read ${direction} — the trend this setup continues is intact.`
                : `Both the 3-day and weekly swing charts read ${direction} — in agreement with this reversion.`
              : swingChart.threeDay === swingChart.weekly
                ? `Both swing charts read ${swingChart.threeDay}, not ${direction} — they agree with each other but not with this setup.`
                : `The 3-day (${swingChart.threeDay}) and weekly (${swingChart.weekly}) swing charts disagree with each other.`) +
            campaignLegNote,
    },
    {
      key: "gannAngleSlope",
      criterion: "Structural trend-angle strength (1x2+)",
      checkOf: "geometricAngles",
      passed: angleHolding,
      note: angleReading?.nearestAngle
        ? `Realized slope ${angleReading.slope.toFixed(2)} points a bar since the ${angleReading.anchorKind} anchor at ${angleReading.anchorPrice.toFixed(2)} (${angleReading.barsSinceAnchor} bars) — nearest to the ${angleReading.nearestAngle.label} structural angle, moving ${angleReading.nearestAngle.direction}.`
        : `No measurable structural angle slope since the last significant ${angleAnchorKind}.`,
    },
    {
      key: "volumeClimax",
      criterion: "Volume at the turn",
      checkOf: "volumeAccumulation",
      passed: volumeClimaxHolding,
      note: climaxReading
        ? volumeNote(climaxReading) + boilingPointNote
        : `No measurable volume reading since the last significant ${angleAnchorKind}.`,
    },
    {
      key: "historicalSR",
      criterion: "Historical support/resistance",
      checkOf: "priceLevels",
      passed: historicalSRPassed,
      note:
        (historicalSRPassed
          ? srMatch
            ? `Price sits at a clustered ${srMatch.timeframe} ${levelRoleLabel(srMatch.role).toLowerCase()} level at ${srMatch.price.toFixed(2)}. ${LEVEL_TIMEFRAME_USAGE[srMatch.timeframe]}.`
            : "Price sits at a clustered macro S/R level."
          : nearSupportResistance && srMatch
            ? `Nearest clustered level at ${srMatch.price.toFixed(2)} is ${levelRoleLabel(srMatch.role).toLowerCase()} — wrong side for a ${direction} setup, so it doesn't confirm.`
            : "Not at a significant historical S/R level.") + levelTestNote,
    },
    {
      key: "entryTriggerArmed",
      // The criterion is "a trigger armed in the setup's own direction" — a
      // reversal for a reversion, a continuation for a continuation. The
      // wording stays outcome-shaped rather than naming the construction,
      // because the user-facing vocabulary gate applies to generated copy.
      criterion: `${setupKind === "continuation" ? "Continuation" : "Reversal"} entry trigger armed`,
      checkOf: "definiteIndication",
      passed: patternValid,
      note: patternValid
        ? gannTrigger!.kind === "hold"
          ? heldNote(gannTrigger!)
          : gannTrigger!.kind === "oldLevel"
            ? `Trigger armed ${gannTrigger!.direction}: the entry rests at the old ${gannTrigger!.direction === "bullish" ? "bottom" : "top"} at ${(gannTrigger!.level ?? gannTrigger!.triggerPrice).toFixed(2)}, where a ${(gannTrigger!.tests ?? 1) >= 2 ? "third" : "second"} test makes the ${(gannTrigger!.tests ?? 1) >= 2 ? "triple" : "double"} ${gannTrigger!.direction === "bullish" ? "bottom" : "top"}, with the stop 3 points beyond it.`
            : `Trigger armed ${gannTrigger!.direction}: a close at ${gannTrigger!.triggerPrice.toFixed(2)} ${gannTrigger!.regained ? regainedNote(gannTrigger!) : `crosses ${crossedLevelName(gannTrigger!.source, gannTrigger!.direction, gannTrigger!.levelYear)} by 3 points`}, and the entry then waits for the pullback toward that level.${gannTrigger!.newRecord ? ` That close was a new record ${gannTrigger!.direction === "bullish" ? "high" : "low"} on the chart.` : ""}`
        : `No ${setupKind === "continuation" ? "continuation" : "reversal"} trigger armed — the swing chart has not completed a level to cross.`,
    },
    {
      key: "stopBehindOldLevel",
      criterion: "Stop 3 points behind an old level",
      checkOf: "definiteIndication",
      passed: stopBehindOldLevel,
      note:
        levels == null
          ? "No trade plan priced, so the setup has no stop to check."
          : stopBehindOldLevel
            ? `An old ${direction === "bullish" ? "bottom" : "top"} stands 3 points in front of the stop, so the market has to break it by the full allowance before the stop is hit.`
            : `No old ${direction === "bullish" ? "bottom" : "top"} stands 3 points in front of the stop.`,
    },
    {
      key: "timePriceSquare",
      criterion: "Price and time squared",
      checkOf: "timeFactors",
      passed: timePriceSquareHolding,
      note: squareReading
        ? timePriceSquareHolding
          ? `${squareReading.barsSinceAnchor} bars since the ${squareReading.anchorKind} anchor at ${squareReading.anchorPrice.toFixed(2)} squares with the ${squareReading.priceMove.toFixed(2)}-point move since it.`
          : `${squareReading.barsSinceAnchor} bars since the ${squareReading.anchorKind} anchor at ${squareReading.anchorPrice.toFixed(2)} does not square with the ${squareReading.priceMove.toFixed(2)}-point move since it.`
        : `No measurable price/time square since the last significant ${angleAnchorKind}.`,
    },
    {
      key: "gannRetracementConfluence",
      criterion: "Retracement zone",
      checkOf: "priceLevels",
      passed: gannConfluenceStackPassed,
      note: retracementMatch
        ? `Price within ${retracementMatch.distancePct.toFixed(2)}% of the ${retracementMatch.label} retracement ${levelRoleLabel(retracementMatch.role).toLowerCase()} at ${retracementMatch.price.toFixed(2)}, inside the ${levelBandPct(retracementMatch.price).toFixed(2)}% band (${LEVEL_BAND_BASIS}).` +
          (drConfluenceHolds ? " A signal-flow reading off the same anchor agrees (context only)." : "") +
          (retracementMatch.importance != null
            ? ` Importance rank ${retracementMatch.importance} of ${LOWEST_RANK} (1 = 50%, the most important; 2 = the quarters and the full range; 3 = the thirds; 4 = the eighths and sixteenths).`
            : " Not one of the explicitly ranked fractions.")
        : `No ${levelRoleLabel(wantedRole).toLowerCase()} retracement zone within ${LEVEL_BAND_BASIS}.`,
    },
    {
      key: "ruleOfThree",
      criterion: "Rule of Three (consecutive closes confirm direction)",
      checkOf: "trendAllTimeframes",
      passed: ruleOfThreeHolding,
      note:
        !ruleOfThreeDaily && ruleOfThreeHigher !== null
          ? `The Rule of Three fires on the ${ruleOfThreeHigher} chart in this setup's direction.`
          : ruleOfThree == null
          ? "Not enough daily history to read the Rule of Three."
          : ruleOfThreeHolding
            ? direction === "bullish"
              ? `${ruleOfThree.consecutiveHigherCloses} consecutive higher closes — Rule of Three reversal signal for an upturn.`
              : `${ruleOfThree.consecutiveLowerCloses} consecutive lower closes — Rule of Three reversal signal for a downturn.`
            : direction === "bullish"
              ? `Only ${ruleOfThree.consecutiveHigherCloses} consecutive higher close(s) — the Rule of Three needs 3 to confirm an upturn.`
              : `Only ${ruleOfThree.consecutiveLowerCloses} consecutive lower close(s) — the Rule of Three needs 3 to confirm a downturn.`,
    },
  ];

  // The nine points (2026-10-17, owner: "the score stays out of 9" and the
  // card's "Stop required"). The checks above feed them and score nothing on
  // their own; see lib/scoring/pillars.ts.
  const monthly = inputs.macroTrends.find((t) => t.timeframe === "1Month")?.direction ?? null;
  const point = (key: CriterionKey, criterion: string, pillar: ScoreBreakdownItem["pillar"], r: PillarResult): ScoreBreakdownItem => ({
    key, criterion, pillar, passed: r.passed, note: r.note,
  });
  breakdown.push(
    point("marketCycle", "Market and cycle position", "timing", marketCyclePillar(pillarFacts, direction)),
    point("trendAllTimeframes", "Trend on every timeframe", "trend", trendPillar({
      side: direction, weeklyLine: pillarFacts?.weeklyLine, threeDay: swingChart?.threeDay, ruleOfThree: ruleOfThreeHolding, monthly,
    })),
    point("relativeStrength", "Relative strength and leadership", "trend", relativeStrengthPillar(pillarFacts, direction)),
    point("activity", "Activity and character", "setup", activityPillar(pillarFacts)),
    point("priceLevels", "Price levels", "structure", priceLevelsPillar(historicalSRPassed, gannConfluenceStackPassed)),
    point("geometricAngles", "Angles", "structure", anglesPillar(pillarFacts, direction, angleHolding)),
    point("timeFactors", "Time", "timing", timePillar({ side: direction, squared: timePriceSquareHolding, facts: pillarFacts })),
    point("volumeAccumulation", "Volume and accumulation", "setup", volumePillar(pillarFacts, direction, volumeClimaxHolding)),
    point("definiteIndication", "Definite indication with the stop placed", "riskReward", definiteIndicationPillar(pillarFacts, direction, patternValid, stopBehindOldLevel)),
  );

  // Points, not criteria met: every criterion is worth one point under the
  // default weights, so this is the same integer it has always been, and a
  // weight set from the attribution study redistributes the same nine points
  // without moving the Execute/Watch cutoffs. Rounded to two decimals because
  // the difference between 6.999 and 7 is float dirt, not a verdict.
  const score =
    Math.round(
      breakdown
        .filter((b) => b.passed && b.pillar !== undefined)
        .reduce((sum, b) => sum + (weights[b.key as CriterionKey] ?? 1), 0) * 100,
    ) / 100;

  // "Execute" is an instruction to place an order, so it requires an order to
  // place. Seven of the nine criteria are context — macro, structure, cycles —
  // and can all pass with no armed pattern and no priced trade plan, which is
  // exactly the 7/9 that would otherwise read as Execute with no entry, stop or
  // targets. Without a plan the strongest honest reading is Watch.
  // M-K5: "Don't risk 3-5 points for 3-5" (*Wall Street Stock Selector*
  // Ch.II; "scalpers ... simply get scalped"). Gann sets no ratio beyond "not
  // equal", so the minimal reading is used: a first target no farther than the
  // risk is not a trade. Added 2026-10-16.
  const evenMoney =
    levels !== null && Math.abs(levels.takeProfit1 - levels.entry) <= Math.abs(levels.entry - levels.stopLoss);
  const tradePlanReady = patternValid && levels !== null && !evenMoney;
  if (score >= EXECUTE_SCORE_THRESHOLD && !tradePlanReady) {
    breakdown.push({
      key: "tradePlanPriced",
      criterion: "Trade plan priced (entry / stop / TP1 / master)",
      passed: false,
      note: !levels
        ? "No trade plan computed — no entry, stop or targets to act on, so the state is held at Watch."
        : !patternValid
          ? "No armed pattern in the setup direction — nothing to enter against, so the state is held at Watch."
          : "The first target is no farther than the risk: the method does not risk a move to make the same move, so the state is held at Watch.",
    });
  }

  const outputState: ScanDecision["outputState"] =
    score >= EXECUTE_SCORE_THRESHOLD && tradePlanReady
      ? "Execute"
      : score >= WATCH_SCORE_THRESHOLD
        ? "Watch"
        : "Reject";

  return { score, outputState, breakdown };
}

/**
 * Hold Execute when the data the verdict was computed on is a whole execution
 * bar or more behind the market.
 *
 * "Execute" is an instruction to place an order at a named trigger price. On a
 * feed delayed by a full bar, that price belongs to a candle that has already
 * closed — the move it was arming for either happened without us or did not
 * happen at all, and there is no way to tell which from the data in hand. Watch
 * is the strongest honest reading, and the note says so in the same voice as the
 * other holds.
 *
 * The score itself is untouched: the analysis was sound, the data was late.
 * Only the instruction to act on it is withdrawn.
 */
export function applyDataLagHold(decision: ScanDecision, lag: DecisionLag): ScanDecision {
  if (!lag.holdsExecute || decision.outputState !== "Execute") return decision;

  return {
    ...decision,
    outputState: "Watch",
    breakdown: [
      ...decision.breakdown,
      {
        key: "dataLag",
        criterion: "Data current enough to act on",
        passed: false,
        note: `${lag.note} Held from Execute to Watch — confirm the trigger against a live quote before acting.`,
      },
    ],
  };
}

/**
 * Gann's breakaway rule (owner decision 5; *Commodities* pp. 51-52): in a
 * sideways market the trader stays out until price breaks away from the
 * range. A range-bound setup whose entry does not cross the range's extreme
 * is held from Execute to Watch. See `lib/gann/breakaway.ts`.
 */
export function applyBreakawayHold(decision: ScanDecision, breakaway: BreakawayReading): ScanDecision {
  if (!breakaway.rangeBound || breakaway.breaksAway || decision.outputState !== "Execute") return decision;
  const fmt = (n: number | null) => (n === null ? "n/a" : n.toFixed(2));
  return {
    ...decision,
    outputState: "Watch",
    breakdown: [
      ...decision.breakdown,
      {
        key: "breakaway",
        criterion: "Breakaway from a sideways range",
        passed: false,
        note: `The market is moving sideways (range ${fmt(breakaway.rangeLow)}-${fmt(breakaway.rangeHigh)}) and the entry stays inside it. Held from Execute to Watch until price breaks away from the range.`,
      },
    ],
  };
}

/**
 * Gann's monthly break as a warning (A-TREND-11/-12, W006 pp.40-43; PLAN.md
 * item 6, step 3): while the month so far has broken the prior month's low in
 * an advance (high in a decline), a new trade with the campaign's trend is
 * held from Execute to Watch. The trend itself still stands (W006 p.14).
 */
export function applyMonthlyBreakHold(
  decision: ScanDecision,
  warning: MonthlyBreakWarning | null,
  direction: "bullish" | "bearish" | "none",
): ScanDecision {
  if (!warning?.monthlyBreak || warning.trend !== direction || decision.outputState !== "Execute") return decision;
  const side = warning.trend === "bullish" ? "low" : "high";
  return {
    ...decision,
    outputState: "Watch",
    breakdown: [
      ...decision.breakdown,
      {
        key: "monthlyBreak",
        criterion: "No break of the prior month's " + side,
        passed: false,
        note: `This month has broken the prior month's ${side}${warning.first ? ", the first such break of the move" : ""}, a warning that the trend may be turning. Held from Execute to Watch while it stands.`,
      },
    ],
  };
}

/**
 * Gann's volume Rule 2 (A-VOLUME-03, W006 pp.39-40; fork FV7 b, item 8 step
 * 5): after a lower top, a narrow spell broken down on increased volume
 * signals a further decline. While that breakdown stands
 * (`readDistributionStanding`), a new long is held from Execute to Watch.
 * Shorts are untouched: the breakaway down is their own entry.
 */
export function applyDistributionBreakdownHold(
  decision: ScanDecision,
  standing: DistributionStanding | null,
  direction: "bullish" | "bearish" | "none",
): ScanDecision {
  if (!standing || direction !== "bullish" || decision.outputState !== "Execute") return decision;
  return {
    ...decision,
    outputState: "Watch",
    breakdown: [
      ...decision.breakdown,
      {
        key: "distributionBreakdown",
        criterion: "No breakdown after a lower top",
        passed: false,
        note: `After a lower top, the narrow range broke down on ${standing.breakoutVolumeRatio.toFixed(1)}× its average volume (${standing.breakDate}), a sign of a further decline. Held from Execute to Watch while price stays under the range, for up to 20 sessions after the break.`,
      },
    ],
  };
}

/**
 * Gann's failed double or triple top (A-LEVELS-04, W006 pp.14-15, 44; fork
 * FL3 a, 2026-10-16): "failing to pass an old top is a top". While a failed
 * top stands between a new long's entry and its first target, the long is
 * held from Execute to Watch; a failed bottom holds a new short the same way
 * (Polarity). The reading is `readMultipleTops` on the 52-week entry chart,
 * the same on both surfaces. A failed top past TP1 is not in the way
 * (`failedTestInPath`). The coarse pre-filter in `lib/marketScan.ts` does
 * not read it, by design: it only narrows the universe before each symbol is
 * scanned, and every symbol it keeps is held here on the full scan (review 11
 * M3).
 */
export function applyFailedTopHold(
  decision: ScanDecision,
  tops: MultipleTopsReading | null | undefined,
  direction: "bullish" | "bearish" | "none",
  levels: Pick<TradeLevels, "entry" | "takeProfit1"> | null | undefined,
): ScanDecision {
  const failed = failedTestInPath(tops, direction, levels?.entry, levels?.takeProfit1);
  if (!failed || decision.outputState !== "Execute") return decision;
  const top = failed.kind === "top";
  const name = `${failed.tests >= 3 ? "triple" : "double"} ${failed.kind}`;
  return {
    ...decision,
    outputState: "Watch",
    breakdown: [
      ...decision.breakdown,
      {
        key: "failedTop",
        criterion: top ? "No failed double top overhead" : "No failed double bottom underneath",
        passed: false,
        note: `The market failed at a ${name} near ${failed.level.toFixed(2)}, which stands before the first target, and closed back ${top ? "under" : "over"} it by the usual allowance: that is a ${failed.kind}. Held from Execute to Watch until a daily close passes the level by the usual allowance or a new swing replaces it.`,
      },
    ],
  };
}

/**
 * Leave queer-acting stocks alone (A-SELECTION-01, W006 pp.20, 34-35; owner,
 * Q24 "Both"; `lib/gann/ruleFollowing.ts`): a stock whose own recent buying
 * and selling points mostly failed is not traded on them. Execute is held to
 * Watch while the reading stands.
 */
export function applyRuleFollowingHold(decision: ScanDecision, reading: RuleFollowingReading | null | undefined): ScanDecision {
  if (!reading?.queer || decision.outputState !== "Execute") return decision;
  return {
    ...decision,
    outputState: "Watch",
    breakdown: [
      ...decision.breakdown,
      {
        key: "queerActing",
        criterion: "Stock follows the rules",
        passed: false,
        note: `Of this stock's last ${reading.resolved} buying and selling points over the year, ${reading.failed} failed back through their stop and ${reading.followed} carried on. A stock that does not follow the rules is left alone, so this is held from Execute to Watch until its signals work again.`,
      },
    ],
  };
}

/**
 * The third time through a round number (A-LEVELS-08; `readFigureCrossing`):
 * the first and second times an entry crosses a major figure, Gann expects it
 * to carry only a point or so over and break back, so the Execute is held to
 * Watch. The third time through is bought.
 */
export function applyFigureCrossingHold(decision: ScanDecision, crossing: FigureCrossingReading | null | undefined): ScanDecision {
  if (!crossing || crossing.time >= FIGURE_BUY_TIME || decision.outputState !== "Execute") return decision;
  const long = crossing.direction === "bullish";
  const fmt = crossing.figure.toFixed(crossing.figure < 10 ? 2 : 0);
  return {
    ...decision,
    outputState: "Watch",
    breakdown: [
      ...decision.breakdown,
      {
        key: "figureCrossing",
        criterion: "Third time through a round number",
        passed: false,
        note: `This ${long ? "buy crosses" : "short breaks"} the round number ${fmt} for the ${crossing.time === 1 ? "first" : "second"} time. Orders gather at round numbers, so the first and second times through usually carry only a point or so ${long ? "over" : "under"} and then break back. Held from Execute to Watch; the third time through is taken.`,
      },
    ],
  };
}

/**
 * Buy the strong and leave the weak alone (A-SELECTION-04, W006 p.33: "Always
 * buy the stocks in strong position and leave those in weak position alone").
 * A buy in a stock that reads weak in a bull market (`readWeakStock`: its
 * early top not exceeded in two years, or its first short rally never
 * exceeded) is held from Execute to Watch. A short in it is untouched: Gann
 * sells the weakest short (pp.37-38), and the sell list ranks it first
 * (`selectionStrength`).
 */
export function applyWeakStockHold(
  decision: ScanDecision,
  weak: WeakStockReading | null | undefined,
  direction: "bullish" | "bearish" | "none",
): ScanDecision {
  if (!weak?.weak || direction !== "bullish" || decision.outputState !== "Execute") return decision;
  const why = weak.earlyTopFailed
    ? `its top of ${weak.earlyTopFailed.top.toFixed(2)} (${weak.earlyTopFailed.month}), made early in the market's advance, has not been exceeded in two years`
    : `its first rally of the market's advance, to ${weak.firstRallyNotExceeded!.top.toFixed(2)} (${weak.firstRallyNotExceeded!.month}), lasted ${weak.firstRallyNotExceeded!.months} months and has never been exceeded`;
  return {
    ...decision,
    outputState: "Watch",
    breakdown: [
      ...decision.breakdown,
      {
        key: "weakStock",
        criterion: "Stock in a strong position",
        passed: false,
        note: `This stock is weak while the market advances: ${why}. Buy the strong and leave the weak alone, so this buy is held from Execute to Watch while the reading stands.`,
      },
    ],
  };
}

/**
 * The shared time-window mechanism (Q19, owner 2026-10-16; `lib/gann/timeWindow.ts`):
 * Gann trades a change of trend when the market turns close to a dated window
 * (A-TIME-15, W036 p.22), and the turn's price confirms it (C-STOP-03). A
 * counter-trend Execute whose bottom (top, for a short) did not come on any
 * open window is held to Watch; a with-the-trend setup acts on price alone.
 */
export function applyTimeWindowHold(
  decision: ScanDecision,
  setupKind: SetupKind,
  /** The turn, or a function reading it: read only when a counter-trend Execute needs it. */
  turnOrRead: WindowTurn | null | undefined | (() => WindowTurn | null),
): ScanDecision {
  if (decision.outputState !== "Execute" || !needsWindowTurn(setupKind)) return decision;
  const turn = typeof turnOrRead === "function" ? turnOrRead() : turnOrRead;
  if (turn) {
    return {
      ...decision,
      breakdown: [
        ...decision.breakdown,
        {
          key: "timeWindowTurn",
          criterion: "Turn came at a time window",
          passed: true,
          note: `The ${turn.kind} on ${turn.date} came on ${turn.windows.slice(0, 3).join("; ")}. Time and price agree on the turn.`,
        },
      ],
    };
  }
  return {
    ...decision,
    outputState: "Watch",
    breakdown: [
      ...decision.breakdown,
      {
        key: "timeWindowTurn",
        criterion: "Turn came at a time window",
        passed: false,
        note: "This trade goes against the trend, and its turn did not come on any dated time window. A change of trend comes at time, so it is held from Execute to Watch until a turn comes on one.",
      },
    ],
  };
}

/**
 * A breached stop retires the plan (owner decision, 2026-09-30; see
 * `lib/gann/stopBreach.ts`). When the plan's stop is broken (price through it,
 * or broken earlier in the session and not yet closed back through the level by
 * the allowance) the plan is over: the structure that qualified it has broken.
 * The verdict drops to Reject, so the monitor goes INVALIDATED and the setup
 * leaves the lists, and stays there until a failed break is shown by a closing
 * bar or a new plan from the new structure replaces it. Applies to Watch as
 * well as Execute: there is no live plan to keep watching. The score is
 * untouched, since the analysis behind it is not what failed.
 */
export function applyStopBreachHold(decision: ScanDecision, breach: StopBreachReading): ScanDecision {
  if (!breach.breached || decision.outputState === "Reject") return decision;
  const fmt = (n: number | null) => (n === null ? "n/a" : n.toFixed(2));
  return {
    ...decision,
    outputState: "Reject",
    breakdown: [
      ...decision.breakdown,
      {
        key: "stopBreach",
        criterion: "Plan's stop still intact",
        passed: false,
        note: `The plan's stop (${fmt(breach.stop)}) is broken (price ${fmt(breach.price)}), so the plan is retired. It stands again only if a bar closes back through ${fmt(breach.reclaimAt)}, the broken level plus the usual 3-point allowance (a failed break), or a new plan from the new structure replaces it.`,
      },
    ],
  };
}


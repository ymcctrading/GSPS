/**
 * Turns Gann's context readings (Stage A, `disclosedRules.ts`; the B2
 * campaign ledger, `campaignLedger.ts`; and the D2/D3 filings readings,
 * `capitalStock.ts` and `incorporationCycle.ts`) into yes/no factors for one trade, in
 * that trade's direction, so the backtest's factor table can measure each one
 * the way it measures the scored criteria (`attributeFactors` with
 * `field: "contextFactors"`).
 *
 * This is how a Gann rule earns a place in the score: implemented, recorded on
 * every trade, measured against the trades where it didn't hold, and only then
 * promoted (AGENTS.md "Gann-derived AND measured"). Measurement checks our
 * translation of the rule; it is not a vote on Gann.
 *
 * Three-question basis: Gann sources are those of the underlying readings.
 * Cycles: this is the base-rate comparison Dewey asks for (master report M4),
 * applied per factor. Hermetic: Cause and Effect, since each factor is a
 * stated cause set against the outcome it is supposed to produce.
 */

import type { DisclosedRulesContext } from "@/lib/gann/disclosedRules";
import { approachingFigure } from "@/lib/gann/evenFigures";
import { computeMacroCycle } from "@/lib/gann/macroCycle";

export type ContextFactors = Record<string, boolean>;

export function contextFactorsFor(
  ctx: DisclosedRulesContext,
  direction: "bullish" | "bearish",
  price: number,
): ContextFactors {
  const bull = direction === "bullish";
  const f: ContextFactors = {};

  if (ctx.barMidpoint) f.closeVsMidpointAgrees = ctx.barMidpoint.lastBar === (bull ? "up" : "down");

  const r3 = (r: typeof ctx.ruleOfThree.weekly) => (r ? (bull ? r.bullishSignal : r.bearishSignal) : undefined);
  const w = r3(ctx.ruleOfThree.weekly);
  if (w !== undefined) f.ruleOfThreeWeeklyAgrees = w;
  const m = r3(ctx.ruleOfThree.monthly);
  if (m !== undefined) f.ruleOfThreeMonthlyAgrees = m;

  f.dayCountBandActive = ctx.dayCountBands.length > 0;
  f.yearFractionActive = ctx.yearFraction !== null;
  f.yearFractionMajor = ctx.yearFraction !== null && ctx.yearFraction.rank <= 2;

  if (ctx.counterMove) {
    f.counterMoveNormal = ctx.counterMove.inCounterMove && ctx.counterMove.phase === "normal";
    f.counterMoveBeyondFirstMonth =
      ctx.counterMove.inCounterMove && (ctx.counterMove.phase === "secondMonth" || ctx.counterMove.phase === "thirdMonth");
    f.withWeeklyTrend = ctx.counterMove.trend === direction;
  }

  // The level the trade leans on: support under a long, resistance over a short.
  const leanedOn = bull ? ctx.levelTests.support : ctx.levelTests.resistance;
  if (leanedOn) f.leanedOnLevelTestedThreePlus = leanedOn.tests >= 3;
  const facing = bull ? ctx.levelTests.resistance : ctx.levelTests.support;
  if (facing) f.facingLevelTestedThreePlus = facing.tests >= 3;

  const pct = ctx.pricePercentages;
  if (pct) {
    const near = [pct.nearestAbove, pct.nearestBelow].some(
      (l) => l !== null && l.importance === 1 && (Math.abs(l.price - price) / price) * 100 <= 1,
    );
    f.nearMajorPercentLevel = near;
  }

  const c = ctx.campaign;
  if (c) {
    const against = c.trend !== direction;
    f.overbalancedAgainstCampaign = against && (c.spaceOverbalanced || c.timeOverbalanced);
    f.monthlyBreakAgainstCampaign = against && c.monthlyBreak;
    f.lateSection = c.sections >= 3;
    // Class C trend readings (W003 p.17), measured, never gating (item 6).
    f.reactionsContractingWithTrade = !against && c.contracting;
    f.timeRatioInvertedAgainstTrade = !against && c.timeRatioInverted;
  }
  // Class C entry readings (W003), measured, never gating (item 5 step 4b).
  if (ctx.halfwayRetest) f.halfwayReturnAgrees = ctx.halfwayRetest.state === "returning" && ctx.halfwayRetest.direction === direction;
  if (ctx.narrowRangeBreak) f.narrowRangeBreakAgrees = ctx.narrowRangeBreak.direction === direction;
  if (ctx.narrowWeekBreak) f.narrowWeekBreakAgrees = ctx.narrowWeekBreak.direction === direction;
  // Stage F1: extreme-price and timing rules, in the trade's direction.
  const rs = ctx.extremes.reverseSignal.signal;
  if (rs) f.reverseSignalAgrees = rs === (bull ? "bottom" : "top");
  const exhaust = ctx.extremes.gaps.exhaustGap;
  if (exhaust) f.exhaustGapAgrees = exhaust === (bull ? "bottom" : "top");
  const filled = ctx.extremes.gaps.filledGapReversal;
  if (filled) f.filledGapAgrees = filled === direction;
  const gapsNew = ctx.extremes.gaps.gapsInNewTerritory;
  // Three or more gaps in new territory in the trade's own direction: that
  // move is near its culmination, a risk to this trade.
  if (gapsNew) f.culminationGapsInTradeDirection = gapsNew.count >= 3 && gapsNew.direction === (bull ? "up" : "down");
  if (ctx.timing.alternation) f.onAlternationTurnDay = ctx.timing.alternation.mark !== null;
  if (ctx.timing.square144) f.square144Convergence = ctx.timing.square144.units.length >= 2;
  if (ctx.timing.projection) f.tightTimeProjection = ctx.timing.projection.spreadDays <= 5;
  // Gann's even figures: a round number just ahead of the entry, in the
  // trade's direction, is where orders gather against it.
  f.roundNumberAhead = approachingFigure(price, direction) !== null;
  // Gann's Seven Zones: entering with the move in its first two zones is
  // early; entering in the third is late, where the chapter places
  // distribution (and the mirror for shorts).
  if (ctx.zone) {
    const z = bull ? ctx.zone.zone : -ctx.zone.zone;
    f.zoneEarlyInTradeDirection = z === 1 || z === 2;
    f.zoneExtremeInTradeDirection = z === 3;
    f.zoneExtremeAgainstTrade = z === -3;
    f.zoneFirstSignOfEnd = ctx.zone.firstSignOfEnd;
  }
  // G8: the seasonal count from March 21 (any point, and the ½/¼/¾/full year).
  if (ctx.seasonal !== undefined) {
    f.seasonalCountActive = ctx.seasonal !== null;
    f.seasonalCountMajor = ctx.seasonal !== null && ctx.seasonal.point.rank <= 2;
  }
  // G22: a breakout from a long range in the trade's direction.
  if (ctx.accumulation) {
    f.longAccumulationBreakoutWithTrade = ctx.accumulation.long && ctx.accumulation.breakout === (bull ? "up" : "down");
  }
  // A-VOLUME-12: the heaviest week since the last top warns of a top.
  if (ctx.topVolume) {
    f.topVolumeWarningAgainst = bull && ctx.topVolume.warning;
    f.topVolumeWarningWith = !bull && ctx.topVolume.warning;
  }
  // A-VOLUME-13: a second top on two-thirds, or a third, of the first top's volume.
  if (ctx.secondTopVolumeRatio != null) {
    const twoThirds = ctx.secondTopVolumeRatio <= 2 / 3;
    const third = ctx.secondTopVolumeRatio <= 1 / 3;
    f.secondTopTwoThirdsVolumeAgainst = bull && twoThirds;
    f.secondTopTwoThirdsVolumeWith = !bull && twoThirds;
    f.secondTopThirdVolumeAgainst = bull && third;
    f.secondTopThirdVolumeWith = !bull && third;
  }
  // A-VOLUME-03: a distribution breakdown counts against a long and with a short.
  if (ctx.distribution) {
    f.distributionBreakdownAgainst = bull && ctx.distribution.distributionBreakdown;
    f.distributionBreakdownWith = !bull && ctx.distribution.distributionBreakdown;
  }
  // G7: a top warning counts against a long and with a short.
  if (ctx.sharesPerPoint) {
    f.sharesPerPointTopAgainst = bull && ctx.sharesPerPoint.topWarning;
    f.sharesPerPointTopWith = !bull && ctx.sharesPerPoint.topWarning;
  }
  // Daily/weekly time rules: a halt at the extreme against the trade, a
  // reaction inside Gann's 2–3 week zone with the weekly trend, an abnormal one.
  if (ctx.timeRules) {
    f.haltAgainstTrade = ctx.timeRules.halt !== null && ctx.timeRules.halt.at === (bull ? "top" : "bottom");
    if (ctx.counterMove?.inCounterMove && ctx.counterMove.trend === direction) {
      f.reactionInTwoToThreeWeekZone = ctx.timeRules.reactionInZone;
      f.reactionInThirdWeek = ctx.timeRules.thirdWeek;
    }
    f.reactionAbnormalLength = ctx.timeRules.reactionAbnormal;
  }
  // Double/triple tops and bottoms: crossed in the trade's direction, or a
  // failed third test standing against it.
  if (ctx.multipleTops) {
    // The level in the trade's path: a top for a long, a bottom for a short.
    const inPath = bull ? ctx.multipleTops.top : ctx.multipleTops.bottom;
    f.multipleTopCrossedWithTrade = inPath?.state === "crossed";
    f.thirdTestFailedAgainstTrade = inPath?.state === "failed";
  }
  // Time balancing (B2): today within two days of a date when the open leg
  // has lasted as long as the matching prior leg.
  if (ctx.campaign && ctx.asOf) {
    const today = Date.parse(ctx.asOf);
    f.onTimeBalanceDate = ctx.campaign.timeBalanceDates.some((d) => Math.abs(Date.parse(d) - today) <= 2 * 86_400_000);
  }
  // Macro cycle (PR #285): Gann's cited DJIA anchors, month-granular and the
  // same for every symbol. A low-anchored window is a bullish backdrop, a
  // high-anchored one bearish; only major (5-year-plus) cycles are counted.
  if (ctx.asOf) {
    const macro = computeMacroCycle(new Date(ctx.asOf));
    const major = macro.activeWindows.filter((w) => w.majorCycleYears.length > 0);
    f.macroMajorCycleActive = major.length > 0;
    f.macroMajorCycleWithTrade = major.some((w) => w.bullish === bull);
  }
  // G25: early and late leaders; the first-year high for longs.
  if (ctx.leadership) {
    f.earlyLeaderInTradeDirection = bull ? ctx.leadership.bottomedFirst : ctx.leadership.toppedFirst;
    if (bull) f.lateMoverLong = ctx.leadership.bottomedLate;
    if (bull && ctx.leadership.firstYearHighCrossed !== null) f.firstYearHighCrossed = ctx.leadership.firstYearHighCrossed;
  }
  // A-TREND-07/-08: a weak stock in a bull market; Gann leaves it alone on
  // the buy side (the action is A-SELECTION-04, PLAN.md item 11).
  if (bull && ctx.weakStock) f.weakStockLong = ctx.weakStock.weak;

  // Class C time counts (item 7 step 2): measured, never gating. The circle,
  // month and cycle counts take their direction from the anchor, as their
  // class A counterparts do (a low argues up); the day, week and seasonal
  // counts carry none, like theirs.
  const st = ctx.secondaryTime;
  if (st) {
    const withTrade = (hs: { pivotKind: "high" | "low" }[]) => hs.some((h) => (h.pivotKind === "low") === bull);
    f.secondaryDayCountActive = st.dayCounts.length > 0;
    f.secondaryWeekCountActive = st.weekCounts.length > 0;
    f.circleDivisionWithTrade = withTrade(st.circleDivisions);
    if (st.monthCounts) f.secondaryMonthCountWithTrade = withTrade(st.monthCounts);
    if (st.cycleFractions) f.cycleFractionWithTrade = withTrade(st.cycleFractions);
    f.seasonalFineStepActive = st.seasonalFineStep !== null;
    // A counter-move against the trade's own trend, by its length.
    if (st.shortCounterMove && st.shortCounterMove.trend === direction) {
      f.counterMovePastFourthDay = st.shortCounterMove.phase === "pastFourthDay";
      f.counterMoveSevenToTen = st.shortCounterMove.phase === "sevenToTen";
    }
    // A top due counts against a long, a bottom due against a short.
    if (st.timeBalanceSpans) f.timeBalanceTurnAgainstTrade = st.timeBalanceSpans.some((b) => b.kind === (bull ? "top" : "bottom"));
    if (st.fanTimeRatios) f.fanTimeRatioActive = st.fanTimeRatios.length > 0;
    // A rise from a low meeting its level on time argues for a turn down,
    // against a long; a fall from a high, the mirror.
    if (st.retracementTiming) f.retracementTurnAgainstTrade = st.retracementTiming.some((h) => (h.anchorKind === "low") === bull);
    if (st.halfPriceHalfTime !== undefined) f.halfPriceHalfTimeRecent = st.halfPriceHalfTime !== null;
  }

  // A-TIME-05/-21: a watched month count (18-48 months in sixes) from a major
  // pivot, its direction from the anchor (a low argues up). Measured, never gating.
  if (ctx.monthCounts) f.watchedMonthCountWithTrade = ctx.monthCounts.some((c) => c.watched && (c.kind === "low") === bull);
  // A-TIME-06: for a long in a market bear, its bottom windows (months 30-36
  // and 40-43) and a bear younger than the shortest on record (time not run out).
  if (bull && ctx.bearDuration) {
    f.marketBearBottomWindow = ctx.bearDuration.inBottomWindow;
    f.marketBearYoung = ctx.bearDuration.beforeShortest;
  }

  // D2: Gann's capital-stock readings are top warnings, so they count against
  // a long and with a short. Absent when no share count is stored.
  const cs = ctx.capitalStock;
  if (cs) {
    f.capitalStockDistributionAgainst = bull && cs.distributionSignal;
    f.capitalStockDistributionWith = !bull && cs.distributionSignal;
  }

  // D3: time from the company's inception has no direction in Gann's text
  // (a date to watch for a change), like the day-count bands above.
  const inc = ctx.incorporation;
  if (inc) {
    if (inc.precision === "day") {
      f.incorporationAnniversary = inc.degree?.degrees === 360;
      f.incorporationDegreeActive = inc.degree !== null;
    }
    if (inc.precision !== "year") f.incorporationMonth = inc.anniversaryMonth;
    f.incorporationCycleYear = inc.completingCycles.length > 0;
  }
  return f;
}

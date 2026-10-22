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
import { failedTestInPath } from "@/lib/gann/multipleTops";
import { computeMacroCycle } from "@/lib/gann/macroCycle";
import { readMassPressure } from "@/lib/gann/massPressure";
import { marketCountHit } from "@/lib/gann/eightyFourYear";
import { readDayCircle } from "@/lib/gann/dayCircle";

export type ContextFactors = Record<string, boolean>;

export function contextFactorsFor(
  ctx: DisclosedRulesContext,
  direction: "bullish" | "bearish",
  price: number,
  /** The plan's first target, when known (A-LEVELS-04's excused population). */
  takeProfit1?: number | null,
  /** The entry bar, for Gann's day clock (`dayCircle.ts`). The replay passes it; omitted, those two factors are absent. */
  entryBar?: { time: string; barMinutes: number },
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
    // C-SWING-01 (W003 p.16, class C): nearly equal corrections, uptrend only.
    f.equalCorrectionsWithTrade = !against && c.equalCorrections;
    f.timeRatioInvertedAgainstTrade = !against && c.timeRatioInverted;
    // C-TREND-03/-06 (Commodities p.312 "price or time"; Master Course Ch.8
    // PDF 249 "by 1+ point"): over-balance with Gann's 1-point margin.
    f.overbalancedByPointAgainstCampaign = against && (c.spaceOverbalancedByPoint || c.timeOverbalanced);
    // C-TIME-27 (Master Course Ch.2 PDF 51, Ch.7 PDF 220): a campaign with
    // the trade in a culmination month, or past 3 years.
    f.campaignCulminationMonthWithTrade = !against && (c.age.culmination1931 || c.age.culmination1935);
    f.campaignPastCeilingWithTrade = !against && c.age.pastThreeYears;
    // C-PRICE-01 (Master Course Ch.6 PDF 197): price within 1% of the
    // prior-range projection, the levelTests tolerance.
    if (c.rangeProjection) f.nearRangeProjection = (Math.abs(c.rangeProjection.price - price) / price) * 100 <= 1;
  }
  // Class C entry readings (W003), measured, never gating (item 5 step 4b).
  if (ctx.halfwayRetest) f.halfwayReturnAgrees = ctx.halfwayRetest.state === "returning" && ctx.halfwayRetest.direction === direction;
  if (ctx.narrowRangeBreak) f.narrowRangeBreakAgrees = ctx.narrowRangeBreak.direction === direction;
  if (ctx.narrowWeekBreak) f.narrowWeekBreakAgrees = ctx.narrowWeekBreak.direction === direction;
  // C-STOP-01 (W003 p.17): a failed push out of the range, in the trade's direction.
  if (ctx.falseBreakout) f.falseBreakoutAgrees = ctx.falseBreakout.direction === direction;
  // C-ENTRY-03 (Master Course Ch.8): the 2nd or 3rd higher bottom (lower top for a short).
  if (ctx.successiveSwings) {
    const n = bull ? ctx.successiveSwings.higherBottoms : ctx.successiveSwings.lowerTops;
    f.secondOrThirdSwingWithTrade = n === 2 || n === 3;
    // Fast moves start from the third or fourth (W003 p.17; Master Course p.248).
    f.thirdOrFourthSwingWithTrade = n === 3 || n === 4;
  }
  // Price grids (priceGrids.ts; Master Course Ch.6 PDF 186, 209-210; Ch.13
  // PDF 375, 378): price within 1% of a level, the levelTests tolerance.
  if (ctx.priceGrids) {
    const g = ctx.priceGrids;
    const near = (...xs: (number | null)[]) => xs.some((x) => x !== null && (Math.abs(x - price) / price) * 100 <= 1);
    f.nearParitySquare = near(g.paritySquares.squareBelow, g.paritySquares.squareAbove);
    f.nearSquareHalfway = near(g.paritySquares.halfwayBelow, g.paritySquares.halfwayAbove);
    f.nearNineTwelveLevel = near(g.nineTwelve.nineBelow, g.nineTwelve.nineAbove, g.nineTwelve.twelveBelow, g.nineTwelve.twelveAbove);
    f.rangeApproachingMultipleOf144 = g.range144.approaching;
  }
  // C-TREND-08 (Master Course Ch.7 PDF 223): the 5th unit of a run on days,
  // weeks or months, in the trade's direction or against it.
  if (ctx.ascension) {
    const units = [ctx.ascension.daily, ctx.ascension.weekly, ctx.ascension.monthly].filter((a) => a?.fifth);
    f.ascensionUnitWithTrade = units.some((a) => a!.direction === (bull ? "up" : "down"));
    f.ascensionUnitAgainstTrade = units.some((a) => a!.direction === (bull ? "down" : "up"));
  }
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
  if (gapsNew) {
    f.culminationGapsInTradeDirection = gapsNew.count >= 3 && gapsNew.direction === (bull ? "up" : "down");
    // M-E12 (Commodities p.321): 6 or more, an extended run, measured on its own.
    f.extendedGapsInTradeDirection = gapsNew.extended && gapsNew.direction === (bull ? "up" : "down");
  }
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
    // The plate's sixteenths (2026-09-30), measured on their own.
    f.seasonalCountSixteenth = ctx.seasonal !== null && ctx.seasonal.point.rank === 5;
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
  // A-VOLUME-10: a session leaving a narrow range, on volume or without it.
  if (ctx.breakawayVolume) {
    const withTrade = ctx.breakawayVolume.direction === direction;
    const onVolume = ctx.breakawayVolume.ratio > 1;
    f.breakawayOnVolumeWith = withTrade && onVolume;
    f.breakawayWithoutVolumeWith = withTrade && !onVolume;
    f.breakawayOnVolumeAgainst = !withTrade && onVolume;
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
  // The last campaign bottom broken by 3 points (A-LEVELS-03): bearish
  // context, against a long and with a short.
  if (ctx.campaignBottoms && ctx.campaignBottoms.bottoms.length > 0) {
    const broken = ctx.campaignBottoms.bottoms[0].broken;
    f.campaignBottomBrokenAgreesWithTrade = bull ? !broken : broken;
  }
  // Price under the bear campaign's secondary rally top (A-LEVELS-02).
  if (ctx.campaign?.secondaryTurn?.kind === "top") f.belowSecondaryRallyTop = price < ctx.campaign.secondaryTurn.price;
  // The first 100 points down from a high fall fastest (A-PRICE-01): against
  // a long, with a short.
  if (ctx.firstFall) f.firstFallFromHighAgreesWithTrade = bull ? !ctx.firstFall.inFirstFall : ctx.firstFall.inFirstFall;
  // Over the 1-point-a-month line from the last campaign bottom (A-PRICE-05):
  // with a long, against a short.
  if (ctx.monthlyAngle) {
    const over = price > ctx.monthlyAngle.price;
    f.overMonthlyAngleAgreesWithTrade = bull ? over : !over;
  }
  // Over the square down from the latest monthly top (C-LEVELS-08): with a
  // long, against a short.
  if (ctx.monthlySquareFromHigh) {
    const over = price > ctx.monthlySquareFromHigh.price;
    f.overSquareFromHighAgreesWithTrade = bull ? over : !over;
  }
  // Over the rising 1x1 from the last low on the calendar-day scale for a
  // long, under the falling one from the last high for a short (C-LEVELS-20,
  // Jensen; context only).
  const calLine = bull ? ctx.calendarDayAngles?.fromLow : ctx.calendarDayAngles?.fromHigh;
  if (calLine) f.calendarDayAngleAgreesWithTrade = bull ? price > calLine.price : price < calLine.price;
  // Double/triple tops and bottoms: crossed in the trade's direction, or a
  // failed test standing against it (the second or third since 2026-10-16,
  // A-LEVELS-04; the factor keeps its name so earlier runs still compare,
  // though its meaning moved with the rule on 2026-10-16: second or third
  // test, then the latest cluster, then failed until passed. Compare runs on
  // the same STRATEGY_VERSION only).
  // A-SELECTION-01 (Q24): the stock's own signals work; the hold reads `queer`.
  if (ctx.ruleFollowing && ctx.ruleFollowing.resolved > 0) f.followsRules = !ctx.ruleFollowing.queer;
  if (ctx.multipleTops) {
    // The level in the trade's path: a top for a long, a bottom for a short.
    const inPath = bull ? ctx.multipleTops.top : ctx.multipleTops.bottom;
    f.multipleTopCrossedWithTrade = inPath?.state === "crossed";
    f.thirdTestFailedAgainstTrade = inPath?.state === "failed";
    // The failed tops the hold excuses (review 12 M3): failed, but not one the
    // trade must pass to reach TP1. Since 2026-10-16 no crossing is exempt,
    // so a trade with one in its path is not entered (review 19 L1).
    if (takeProfit1 != null && inPath?.state === "failed") {
      f.failedTopBeyondFirstTarget = failedTestInPath(ctx.multipleTops, direction, price, takeProfit1) === null;
    }
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
  // A-OTHER-05: the market's mass-pressure curve (P1's cycle check reads it
  // too), for a stock only, as P1 reads it.
  if (ctx.asOf && ctx.stockMarket) {
    const mp = readMassPressure(new Date(ctx.asOf));
    if (mp?.direction) f.massPressureWithTrade = mp.direction === direction;
  }
  // A-OTHER-06: the Dollar Trend, the market's monthly value crossing old highs or breaking old lows.
  if (ctx.dollarTrend?.direction) f.dollarTrendWithTrade = ctx.dollarTrend.direction === direction;
  // C-ASTRO-05: the market's major turn 84 years back to the month (Ch. 7, PDF 219), for a stock.
  if (ctx.asOf && ctx.stockMarket) {
    const hit = marketCountHit(new Date(ctx.asOf));
    if (hit) f.eightyFourYearCountWithTrade = (hit.kind === "low") === bull;
  }
  // G25: early and late leaders; the first-year high for longs.
  if (ctx.leadership) {
    f.earlyLeaderInTradeDirection = bull ? ctx.leadership.bottomedFirst : ctx.leadership.toppedFirst;
    if (bull) f.lateMoverLong = ctx.leadership.bottomedLate;
    // A-TIME-08 (W006 pp.31, 35-37): late tops make late bottoms, early tops early ones. Measured, never gating.
    f.lateBottomExpected = ctx.leadership.lateBottomExpected;
    f.earlyBottomExpected = ctx.leadership.earlyBottomExpected;
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
    if (st.fanTimeRatios) f.fanTimeRatioActive = st.fanTimeRatios.length > 0;
    // A rise from a low meeting its level on time argues for a turn down,
    // against a long; a fall from a high, the mirror.
    if (st.retracementTiming) f.retracementTurnAgainstTrade = st.retracementTiming.some((h) => (h.anchorKind === "low") === bull);
    if (st.halfPriceHalfTime !== undefined) f.halfPriceHalfTimeRecent = st.halfPriceHalfTime !== null;
  }

  // Class A time counts read as context (2026-10-16, `timeCounts.ts`):
  // measured, never gating. Directions follow each count's class A
  // counterpart: from an anchor, a low argues up.
  const tc = ctx.timeCounts;
  if (tc) {
    if (tc.lessonCycles) f.lessonCycleWithTrade = tc.lessonCycles.some((h) => (h.kind === "low") === bull);
    f.wheelCountCh5WithTrade = tc.wheelCountsCh5.some((h) => (h.pivotKind === "low") === bull);
    // Time balance (M-T11, class A since 2026-10-16; the factor names are kept
    // so earlier runs still compare). A top due counts against a long, a
    // bottom due against a short.
    f.timeBalanceTurnAgainstTrade = tc.timeBalanceSpans.some((b) => b.kind === (bull ? "top" : "bottom"));
    // A due bottom confirmed by a false break, with a long; a top, with a short (C-STOP-03).
    f.timeBalanceFalseBreakWithTrade = tc.timeBalanceSpans.some((b) => b.falseBreak && b.kind === (bull ? "bottom" : "top"));
    // The day bands and calendar dates carry no direction, like Rule 8's bands.
    f.commoditiesDayBandActive = tc.commoditiesDayBands.length > 0;
    f.rule8DateActive = tc.rule8Date !== null;
    f.rule8DateMostImportant = tc.rule8Date?.mostImportant === true;
    f.winterQuarterDateActive = tc.winterQuarter !== null;
    f.weekCountClassAActive = tc.weekCounts.length > 0;
    // Weeks since the run began (M-T10), for a run in the trade's direction.
    if (tc.boilingRun) {
      const withRun = tc.boilingRun.run === (bull ? "up" : "down");
      f.boilingRunClassicWithTrade = withRun && tc.boilingRun.phase === "classic";
      f.boilingRunPastClassicWithTrade = withRun && (tc.boilingRun.phase === "extended" || tc.boilingRun.phase === "overrun");
    }
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
  // Master Course Ch. 3: the Overnight Chart and the mechanical method on it.
  const o = ctx.overnight;
  if (o) {
    const side = bull ? "up" : "down";
    f.overnightLineWithTrade = o.line === side;
    f.overnightTurnedWithTrade = o.turnedToday && o.line === side;
    if (o.system) f.overnightSystemWithTrade = o.system === (bull ? "long" : "short");
    // The worked log's buying (selling) point: the half-way point of the last
    // swing in the trade's direction, within one point.
    if (o.halfway) f.atOvernightHalfwayWithTrade = o.halfway.swing === side && Math.abs(price - o.halfway.price) <= o.point;
  }
  // Rule 8: three closes around one price, then a break, on any timeframe.
  const clusters = [ctx.closeClusters.daily, ctx.closeClusters.weekly, ctx.closeClusters.monthly].filter((c) => c?.breakout);
  if (clusters.length > 0) {
    f.closeClusterBreakWithTrade = clusters.some((c) => c?.breakout === (bull ? "up" : "down"));
    f.closeClusterBreakAgainstTrade = clusters.some((c) => c?.breakout === (bull ? "down" : "up"));
  }

  // The Square of 144 Master Calculator (1953). Gann gives these points no
  // direction: they are where trend changes come, so they are recorded as
  // they stand, like the day-count bands.
  const mc = ctx.masterCalculator;
  if (mc) {
    f.square144PriceOnStrongPoint = mc.strongPlacements.length > 0;
    const pivots = [mc.fromHigh, mc.fromLow].filter((p) => p !== null);
    f.square144TimeOnChangePoint = pivots.some((p) => p!.onChangePoint.some((h) => h.unit !== "marketDays"));
    f.square144TimePriceSquare = pivots.some((p) => p!.timePriceSquare.length > 0);
    f.square144SquaringPrice = pivots.some((p) => p!.squaringPrice.length > 0);
    f.greatCycleFraction = pivots.some((p) => p!.greatCycleFraction !== null);
  }
  // The circle of 360° (1953): half-way points and moves on a major degree.
  const circle = ctx.circle;
  if (circle) {
    f.circleHalfwayMajor = circle.halfway.major || circle.halfHigh.major;
    f.circleMoveMajor = circle.upFromLow.major || circle.downFromHigh.major;
    f.circleTimeMajor = circle.time.some((t) => t.reading.major);
  }
  // GA-32: price on the degree of its time angle from inception.
  if (ctx.timeAngle) {
    f.timeAngleBalanced = ctx.timeAngle.state === "balanced";
    f.priceAheadOfTimeWithTrade = ctx.timeAngle.state === (bull ? "ahead" : "behind");
  }
  // The planetary averages (1954 letter), Tier A ones only.
  const pl = ctx.planetary;
  if (pl) {
    const on = (prefix: string) => pl.averages.some((a) => a.tier === "A" && a.id.startsWith(prefix) && a.on);
    f.onPlanetaryAverage = pl.averages.some((a) => a.tier === "A" && a.on);
    f.onSixPlanetAverage = on("six");
    f.onMOF = on("mof");
    f.onCOE = on("coe");
  }
  // The time square (Gann's Square of Nine plate read in time): days, weeks or
  // months from the extreme high or low on its cardinal cross, or on either
  // cross. No direction in Gann's text; recorded as it stands.
  if (ctx.squareOfNineTime) {
    f.timeSquareCardinal = ctx.squareOfNineTime.some((h) => h.line.kind === "cardinal");
    f.timeSquareOnCross = ctx.squareOfNineTime.some((h) => h.line.kind !== "sixteenth");
  }
  // The Hexagon Chart in time (G26): a ring completion, a corner, or one of
  // Gann's named month counts (60, 66, 127, 169). No direction in his text.
  if (ctx.hexagonTime) {
    f.hexagonTimeCompletion = ctx.hexagonTime.some((h) => h.line?.kind === "completion");
    f.hexagonTimeCorner = ctx.hexagonTime.some((h) => h.line !== null && h.line.kind !== "midside");
    f.hexagonNamedCount = ctx.hexagonTime.some((h) => h.named !== null);
  }
  // The Master Chart of 360° (G28): a 48th the 1953 order lacks, or a seventh.
  if (ctx.masterChartTime) {
    f.masterChartTime48th = ctx.masterChartTime.some((h) => h.fortyEighth !== null);
    f.masterChartTimeSeventh = ctx.masterChartTime.some((h) => h.seventh !== null);
  }
  // Gann's full angle set from the major pivots (G27). The levels act through
  // the S/R list; this records price on a line, on a parallel, and on the 3×1
  // or steeper from a bottom.
  const pa = ctx.patternAngles;
  if (pa) {
    f.onPatternAngle = pa.on !== null;
    f.onPatternAngleParallel = pa.onParallel;
    f.onSteepAngleFromBottom = pa.onSteepFromBottom;
  }
  // Gann's day clock at the entry bar: a major degree of the day inside the
  // bar, and price on the degree of its time angle.
  if (entryBar) {
    const unit = ctx.masterCalculator?.unit;
    const r = readDayCircle(new Date(entryBar.time), entryBar.barMinutes, price, unit);
    f.entryOnDayCircleMajor = r.majorDegree !== null;
    if (unit) f.entryPriceOnDayTimeAngle = r.priceOnTimeAngle;
  }
  // Gann's planetary rules and Jensen's method (`astroRules.ts`, `jensen.ts`):
  // measured here. The levels act through the S/R list and the dated readings
  // through the shared time-window mechanism once it exists. Only the close
  // through a planet's longitude has a direction in Gann's text.
  const astro = ctx.astro;
  if (astro) {
    f.astroOnActiveAngle = astro.activeAngles.length > 0;
    if (astro.closedThroughBody) f.astroClosedThroughPlanetWithTrade = astro.closedThroughBody.direction === (bull ? "up" : "down");
    if (astro.sunTravel) f.astroOnSunTravelLevel = astro.sunTravel.on;
    if (astro.marsHalfReturn) f.astroMarsHalfReturn = astro.marsHalfReturn.today;
    f.astroOnWheelOfExtreme = astro.wheel !== null;
    f.astroNaturalAngleNear = astro.naturalAngle.near;
    f.astroSolarSeasonalPoint = astro.solarPoint !== null;
    f.astroNewMoon = astro.newMoon !== null;
    f.astroLunarReturnFromPivot = astro.lunarReturn !== null;
    f.jensenSquareOf90Price = astro.jensen.price !== null;
    f.jensenSquareOf90Time = astro.jensen.time !== null;
    // Jensen's slow-planet aspects: the square family bearish, the trine
    // family bullish (`jensen.ts`). Read only when one family outnumbers the other.
    const bias = astro.jensen.aspects.bias;
    if (bias === "bullish" || bias === "bearish") f.jensenAspectsWithTrade = bias === (bull ? "bullish" : "bearish");
    f.jensenAspectTriggered = astro.jensen.aspects.triggered;
    // Jensen's projection: price has reached the estimated exhaustion of the move, within his one point.
    const proj = astro.jensen.projection;
    if (proj) f.jensenAtProjectedExhaustion = proj.direction === "up" ? price >= proj.price - astro.unit : price <= proj.price + astro.unit;
  }
  // Price read as time and the long counts (priceAsTime.ts; Master Course
  // Ch.4 PDF 125, 144-150; Ch.6 PDF 191-197; Ch.13 PDF 375, 379; Ch.15B PDF
  // 422-423; Ch.16 PDF 428-430; Ch.18 PDF 440). No direction in the text.
  const pt = ctx.priceAsTime;
  if (pt) {
    f.priceAsTimeOnCount = pt.hits.length > 0;
    f.priceTimeBalanceWeeks = pt.balance.fromLow.balanced || pt.balance.fromHigh.balanced;
    // A-PRICE-03 (Ch.4 PDF 151, Ch.6 PDF 202): ahead of time, and a gain past one point a month.
    f.priceAheadOfTime = pt.balance.fromLow.position === "ahead" || pt.balance.fromHigh.position === "ahead";
    f.gainBeyondPointPerMonth = pt.balance.fromLow.beyondPointPerMonth;
    f.halvingChainDay = pt.halving.hits.length > 0;
    f.twoPivotFractionMeet = pt.twoPivot !== null;
    f.twoPivotFractionAtHalfOrThreeQuarter = pt.twoPivot?.priceAtHalfOrThreeQuarter ?? false;
    f.squareOf90Count = pt.squareOf90.length > 0;
    f.marketDayEleventhCount = pt.marketDays.length > 0;
    if (pt.inceptionRead) {
      f.squareOf90FromInception = pt.squareOf90.some((s) => s.origin === "inception");
      f.hexagonMonthFromInception = pt.hexagonInception !== null;
    }
  }
  // Angles from zero, from a double or triple bottom (top), and in the square
  // of the range (C-LEVELS-04/-05/-09, `angleCrossings.ts`). No direction in
  // Gann's text for these; recorded as they stand.
  const ac = ctx.angleCrossings;
  if (ac) {
    f.onZeroAngle = ac.fromZero.onLine;
    f.atZeroAngleBalance = ac.fromZero.atBalance;
    if (ac.multipleTests) {
      f.onMultipleTestAngle = ac.multipleTests.onAngle;
      f.atMultipleTestCrossing = ac.multipleTests.atCrossing;
    }
    if (ac.square) {
      f.onSquareOfRangeAngle = ac.square.onAngle;
      f.atSquareOfRangeCrossing = ac.square.atCrossing || ac.square.atEnd;
    }
    f.nearestAngleIsOneByOne = ac.nearestAngleRank === 1;
  }
  // The year's trend from its opening ranges (A-TIME-20) and the decade
  // analogues' month ahead (A-TIME-14), each against the trade's direction.
  const yr = ctx.yearRanges;
  if (yr && yr.yearTrend !== "inside") f.yearRangeTrendWithTrade = yr.yearTrend === (bull ? "up" : "down");
  const da = ctx.decadeAnalogue;
  if (da?.agreed) f.decadeAnalogueWithTrade = da.agreed === (bull ? "up" : "down");
  // The square of 52 (M-T6, C-TIME-46) and the decade digit (M-T17, C-TIME-24), as the card reads them.
  if (ctx.squareOf52) f.squareOf52Window = ctx.squareOf52.active;
  const dc = ctx.decadeCycle;
  if (dc && dc.currentBias !== "mixed") f.decadeYearWithTrade = dc.currentBias === (bull ? "bullish" : "bearish");
  if (dc?.ninetiethMonth) f.decadeNinetiethMonth = dc.ninetiethMonth.active;
  // A-TIME-07: the market's bull campaign at the prior one's length. No direction in the text.
  const cl = ctx.campaignLength;
  if (cl?.current && cl.prior) f.bullCampaignAtPriorLength = cl.atPriorLength;
  // A-TIME-32: a fixed count from the founding date. No direction in the text.
  const fc = ctx.foundingCounts;
  if (fc) {
    f.foundingCountYear = fc.years.length > 0;
    f.foundingCount42Months = fc.months42;
  }
  // A-TIME-33: a 490, 1,290 or 1,335-day count from a major monthly turn. No direction in the text.
  if (ctx.outbreakCounts) f.outbreakDayCount = ctx.outbreakCounts.length > 0;
  // A-SELECTION-07: a small number of shares, read on short candidates only.
  if (!bull && ctx.capitalStock?.smallFloat !== undefined) f.smallFloatShort = ctx.capitalStock.smallFloat;
  // C-STOP-02: a break of the 1x1 points down from a low and up from a high.
  if (ctx.oneByOneBreak && ctx.oneByOneBreak.length > 0) f.oneByOneBreakWithTrade = ctx.oneByOneBreak.some((b) => b.direction === (bull ? "up" : "down"));
  // C-LEVELS-24: the session is on the convergence of lines from a double or triple bottom (top), within a bar. No direction in the text.
  if (ctx.jensenConvergence) f.jensenConvergenceNow = Math.abs(ctx.jensenConvergence.point.barsFromNow) <= 1;
  // A-TIME-16: the next change date's label. No direction in the text.
  if (ctx.timing.changeDates?.next) f.nextChangeDateExpectsHigh = ctx.timing.changeDates.next.expect === "high";
  // A-TIME-03: the advance out of a bear market's low. Bull side only in the text; read the same for both directions.
  const fr = ctx.firstRally;
  if (fr && fr.state !== "early") {
    f.firstRallyOnly = fr.state === "firstRally";
    f.bullCampaignThreeMonths = fr.state === "bullCampaign";
  }
  // C-TIME-03 (W003 p.16, class C): the range break at a cycle's expiry, a short setup only.
  if (!bull && ctx.cycleRangeBreak) f.cycleRangeBreakShort = ctx.cycleRangeBreak.shortSetup;
  // M-R8: the weekly trend line is green for a long, red for a short.
  if (ctx.weeklyOneBar?.colour) f.weeklyOneBarWithTrade = ctx.weeklyOneBar.colour === (bull ? "green" : "red");
  return f;
}

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
  return f;
}

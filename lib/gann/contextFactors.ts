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

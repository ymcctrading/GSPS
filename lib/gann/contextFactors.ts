/**
 * Turns Gann's context readings (Stage A, `disclosedRules.ts`, and the B2
 * campaign ledger, `campaignLedger.ts`) into yes/no factors for one trade, in
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
  return f;
}

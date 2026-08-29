/** Request validation for the trade-plan lifecycle API routes. */

import { z } from "zod";

const RunnerRuleSchema = z.object({
  enabled: z.boolean(),
  description: z.string().min(1),
});

const CoordinatesSchema = z.object({
  entryTrigger: z.number(),
  entryLimitTolerance: z.number().nonnegative(),
  invalidation: z.number(),
  stopType: z.enum(["alert_only", "stop_market", "stop_limit", "close_confirmed_alert"]),
  takeProfit1: z.number(),
  takeProfit2: z.number(),
  masterProfit: z.number().nullable(),
  runnerRule: RunnerRuleSchema,
});

const RiskSchema = z.object({
  approvedQuantity: z.number().nonnegative(),
  fractionalCapability: z.boolean(),
  plannedDollarRisk: z.number().nonnegative(),
  allocationPct: z.number().nonnegative(),
  totalOpenRiskSnapshot: z.number().nonnegative(),
});

const RegimeReadSchema = z.object({
  regime: z.enum(["trend", "range", "transition", "event"]),
  direction: z.enum(["bullish", "bearish", "sideways"]),
  reasons: z.array(z.string()),
  disqualifiers: z.array(z.string()),
});

const RulesAlignmentBreakdownItemSchema = z.object({
  key: z.string(),
  label: z.string(),
  points: z.number(),
  maxPoints: z.number(),
  applicable: z.boolean(),
  passed: z.boolean(),
  note: z.string(),
});

const RulesAlignmentScoreSchema = z.object({
  score: z.number(),
  tier: z.enum(["watchlistOnly", "qualified", "aTier", "aPlusTier"]),
  breakdown: z.array(RulesAlignmentBreakdownItemSchema),
});

const EvidenceSchema = z.object({
  regime: RegimeReadSchema,
  alignment: RulesAlignmentScoreSchema,
  dataTimestamps: z.record(z.string(), z.string()),
  eventLiquidityStatus: z.string(),
});

export const NewTradePlanSchema = z.object({
  strategyVersion: z.string().min(1),
  signalId: z.string().min(1),
  instrument: z.string().min(1),
  market: z.string().min(1),
  timeframe: z.string().min(1),
  generatedAt: z.string(),
  expiresAt: z.string(),
  direction: z.enum(["bullish", "bearish"]),
  coordinates: CoordinatesSchema,
  risk: RiskSchema,
  evidence: EvidenceSchema,
});

export type NewTradePlanBody = z.infer<typeof NewTradePlanSchema>;

export const PlanEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("qualify"), at: z.string(), reason: z.string() }),
  z.object({ type: z.literal("arm"), at: z.string(), reason: z.string() }),
  z.object({
    type: z.literal("enter"),
    at: z.string(),
    fillPrice: z.number().positive(),
    cooldownBlocksNewEntry: z.boolean(),
  }),
  z.object({ type: z.literal("tp1_fill"), at: z.string() }),
  z.object({ type: z.literal("tp2_fill"), at: z.string() }),
  z.object({ type: z.literal("master_fill"), at: z.string(), closedBarConfirmed: z.boolean() }),
  z.object({ type: z.literal("start_runner"), at: z.string() }),
  z.object({ type: z.literal("close"), at: z.string(), reason: z.string() }),
  z.object({ type: z.literal("expire"), at: z.string() }),
  z.object({ type: z.literal("invalidate"), at: z.string(), reason: z.string() }),
  z.object({
    type: z.literal("edit"),
    at: z.string(),
    reason: z.string(),
    patch: z.object({
      plannedDollarRisk: z.number().nonnegative().optional(),
      approvedQuantity: z.number().nonnegative().optional(),
    }),
    userConfirmed: z.boolean(),
  }),
  z.object({ type: z.literal("raise_floor"), at: z.string(), price: z.number() }),
  z.object({ type: z.literal("mark_price"), at: z.string(), price: z.number() }),
]);

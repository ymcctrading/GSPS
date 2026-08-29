/**
 * Shared types for the Trade Lifecycle, Exit & Runner Engine.
 *
 * Source: "Trade Lifecycle, Exit & Runner Engine" spec pack (2026-08-28).
 * Draft implementation directives — requires securities/compliance counsel
 * review before use in live personalized recommendations or execution.
 *
 * "A signal without complete lifecycle fields is not tradeable" — `TradePlan`
 * is the versioned, persisted object that carries those fields end to end.
 * It is distinct from `lib/signals` (which decides *whether* a setup
 * qualifies) and `lib/trade/protocol-exit.ts` (which prices the tranches once
 * a plan is entered) — this module is the state the two are stitched onto.
 */

import type { Direction } from "@/lib/types";
import type { RegimeRead, RulesAlignmentScore } from "@/lib/signals/types";

export type PlanState =
  | "watchlist"
  | "qualified"
  | "armed"
  | "entered"
  | "tp1_reached"
  | "tp2_reached"
  | "master_reached"
  | "runner"
  | "closed"
  | "expired"
  | "invalidated";

/** States in which no trigger has filled yet — the only states EXPIRED can be reached from. */
export const PRE_ENTRY_STATES: readonly PlanState[] = ["watchlist", "qualified", "armed"];

/** States in which a position is open — the only states INVALIDATED and CLOSE/REDUCE/PROTECT apply to. */
export const ACTIVE_STATES: readonly PlanState[] = [
  "entered",
  "tp1_reached",
  "tp2_reached",
  "master_reached",
  "runner",
];

export const TERMINAL_STATES: readonly PlanState[] = ["closed", "expired", "invalidated"];

export type StopType = "alert_only" | "stop_market" | "stop_limit" | "close_confirmed_alert";

/** Runner behavior once the residual quantity is running. */
export interface RunnerRule {
  /** False when the residual is too few units to scale (see `lib/trade/protocol-exit.ts` splittable). */
  enabled: boolean;
  /** One sentence describing the trail — mirrors the tranche/stop explanation shown to the user. */
  description: string;
}

/** `Coordinates` field group. */
export interface PlanCoordinates {
  entryTrigger: number;
  entryLimitTolerance: number;
  invalidation: number;
  stopType: StopType;
  takeProfit1: number;
  takeProfit2: number;
  /** Novice extension target; absent when the setup doesn't credibly reach it. */
  masterProfit: number | null;
  runnerRule: RunnerRule;
}

/** `Risk` field group. */
export interface PlanRisk {
  approvedQuantity: number;
  fractionalCapability: boolean;
  plannedDollarRisk: number;
  allocationPct: number;
  /** Total open risk across the account at the moment this plan was approved. */
  totalOpenRiskSnapshot: number;
}

/** `Evidence` field group. */
export interface PlanEvidence {
  regime: RegimeRead;
  alignment: RulesAlignmentScore;
  dataTimestamps: Record<string, string>;
  eventLiquidityStatus: string;
}

/** `Audit` field group — one entry per plan edit, user action, price event, notification, or fill. */
export interface PlanAuditEntry {
  version: number;
  at: string;
  kind:
    | "plan_edit"
    | "user_action"
    | "price_event"
    | "notification"
    | "execution"
    | "imported_fill";
  fromState: PlanState;
  toState: PlanState;
  reason: string;
  /** True when this edit raised `plannedDollarRisk` or `approvedQuantity` above the prior version. */
  riskIncreased: boolean;
  /** Required (and must be true) whenever `riskIncreased` is true — see spec: "risk may not be
   * increased without re-evaluation and user confirmation." */
  userConfirmed: boolean;
}

/** The full versioned trade-plan object. A signal is not tradeable until every field group is populated. */
export interface TradePlan {
  // Identity
  planId: string;
  strategyVersion: string;
  signalId: string;
  userId: string;
  instrument: string;
  market: string;
  timeframe: string;
  generatedAt: string;
  expiresAt: string;
  direction: Exclude<Direction, "none">;

  coordinates: PlanCoordinates;
  risk: PlanRisk;
  evidence: PlanEvidence;

  state: PlanState;
  version: number;
  audit: PlanAuditEntry[];

  // Execution facts, filled in as they happen — absent (null) until they do.
  actualEntryPrice: number | null;
  actualEntryAt: string | null;
  highWater: number | null;
  masterProfitFloor: number | null;
  closedAt: string | null;
  closeReason: string | null;
}

export interface StructuredReview {
  planId: string;
  planAdherence: "followed" | "deviated" | "not_entered";
  plannedEntry: number;
  actualEntry: number | null;
  plannedStop: number;
  plannedTargets: { tp1: number; tp2: number; masterProfit: number | null };
  ruleState: PlanState;
  lessonTags: string[];
  summary: string;
}

/**
 * Persistence for the trade-plan lifecycle — reads/writes
 * `public.trade_plans` and `public.trade_plan_audit`
 * (supabase/migrations/0045_trade_plan_lifecycle.sql) and is the only place
 * that translates between the snake_case row shape and the camelCase
 * `TradePlan` object `lib/lifecycle/transitions.ts` operates on.
 *
 * Every event write is two statements — update the plan row, insert the
 * matching audit row — not one transaction. That mirrors how the rest of the
 * ledger (`orders`, `protocol_exits`) is written in this app: races are
 * caught by a unique constraint (`trade_plan_audit(plan_id, version)`) rather
 * than serialized. A concurrent writer that loses the race gets a duplicate-
 * key error back rather than a torn write.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlanState, TradePlan } from "./types";
import { EMPTY_ENTRY_CONFIRMATION } from "./types";
import { applyPlanEvent, type PlanEvent, type TransitionResult } from "./transitions";

/** Everything the caller must supply to start a plan at WATCHLIST. */
export type NewTradePlan = Omit<
  TradePlan,
  | "planId"
  | "userId"
  | "state"
  | "version"
  | "audit"
  | "actualEntryPrice"
  | "actualEntryAt"
  | "highWater"
  | "masterProfitFloor"
  | "closedAt"
  | "closeReason"
>;

// ---- row <-> object mapping -------------------------------------------------

function rowToPlan(row: Record<string, unknown>, auditRows: Record<string, unknown>[]): TradePlan {
  return {
    planId: row.plan_id as string,
    strategyVersion: row.strategy_version as string,
    signalId: row.signal_id as string,
    userId: row.user_id as string,
    instrument: row.instrument as string,
    market: row.market as string,
    timeframe: row.timeframe as string,
    generatedAt: row.generated_at as string,
    expiresAt: row.expires_at as string,
    direction: row.direction as TradePlan["direction"],
    signalFingerprint: (row.signal_fingerprint as string | null) ?? null,
    coordinates: {
      entryTrigger: Number(row.entry_trigger),
      entryLimitTolerance: Number(row.entry_limit_tolerance),
      invalidation: Number(row.invalidation),
      stopType: row.stop_type as TradePlan["coordinates"]["stopType"],
      takeProfit1: Number(row.take_profit_1),
      takeProfit2: Number(row.take_profit_2),
      masterProfit: row.master_profit == null ? null : Number(row.master_profit),
      runnerRule: row.runner_rule as TradePlan["coordinates"]["runnerRule"],
    },
    risk: {
      approvedQuantity: Number(row.approved_quantity),
      fractionalCapability: Boolean(row.fractional_capability),
      plannedDollarRisk: Number(row.planned_dollar_risk),
      allocationPct: Number(row.allocation_pct),
      totalOpenRiskSnapshot: Number(row.total_open_risk_snapshot),
    },
    evidence: {
      regime: row.regime as TradePlan["evidence"]["regime"],
      alignment: row.alignment as TradePlan["evidence"]["alignment"],
      dataTimestamps: (row.data_timestamps ?? {}) as Record<string, string>,
      eventLiquidityStatus: row.event_liquidity_status as string,
    },
    entryConfirmation: {
      ...EMPTY_ENTRY_CONFIRMATION,
      ...((row.entry_confirmation ?? {}) as Partial<TradePlan["entryConfirmation"]>),
    },
    state: row.state as PlanState,
    version: Number(row.version),
    audit: auditRows
      .slice()
      .sort((a, b) => Number(a.version) - Number(b.version))
      .map((a) => ({
        version: Number(a.version),
        at: a.at as string,
        kind: a.kind as TradePlan["audit"][number]["kind"],
        fromState: a.from_state as PlanState,
        toState: a.to_state as PlanState,
        reason: a.reason as string,
        riskIncreased: Boolean(a.risk_increased),
        userConfirmed: Boolean(a.user_confirmed),
      })),
    actualEntryPrice: row.actual_entry_price == null ? null : Number(row.actual_entry_price),
    actualEntryAt: (row.actual_entry_at as string | null) ?? null,
    highWater: row.high_water == null ? null : Number(row.high_water),
    masterProfitFloor: row.master_profit_floor == null ? null : Number(row.master_profit_floor),
    closedAt: (row.closed_at as string | null) ?? null,
    closeReason: (row.close_reason as string | null) ?? null,
  };
}

function newPlanToRow(userId: string, plan: NewTradePlan): Record<string, unknown> {
  return {
    user_id: userId,
    strategy_version: plan.strategyVersion,
    signal_id: plan.signalId,
    instrument: plan.instrument,
    market: plan.market,
    timeframe: plan.timeframe,
    direction: plan.direction,
    generated_at: plan.generatedAt,
    expires_at: plan.expiresAt,
    signal_fingerprint: plan.signalFingerprint,
    entry_trigger: plan.coordinates.entryTrigger,
    entry_limit_tolerance: plan.coordinates.entryLimitTolerance,
    invalidation: plan.coordinates.invalidation,
    stop_type: plan.coordinates.stopType,
    take_profit_1: plan.coordinates.takeProfit1,
    take_profit_2: plan.coordinates.takeProfit2,
    master_profit: plan.coordinates.masterProfit,
    runner_rule: plan.coordinates.runnerRule,
    approved_quantity: plan.risk.approvedQuantity,
    fractional_capability: plan.risk.fractionalCapability,
    planned_dollar_risk: plan.risk.plannedDollarRisk,
    allocation_pct: plan.risk.allocationPct,
    total_open_risk_snapshot: plan.risk.totalOpenRiskSnapshot,
    regime: plan.evidence.regime,
    alignment: plan.evidence.alignment,
    data_timestamps: plan.evidence.dataTimestamps,
    event_liquidity_status: plan.evidence.eventLiquidityStatus,
    entry_confirmation: plan.entryConfirmation,
    state: "watchlist",
    version: 0,
  };
}

/** Columns a transition can change. `updated_at` is stamped on every call. */
function planToUpdateRow(plan: TradePlan): Record<string, unknown> {
  return {
    state: plan.state,
    version: plan.version,
    entry_confirmation: plan.entryConfirmation,
    planned_dollar_risk: plan.risk.plannedDollarRisk,
    approved_quantity: plan.risk.approvedQuantity,
    actual_entry_price: plan.actualEntryPrice,
    actual_entry_at: plan.actualEntryAt,
    high_water: plan.highWater,
    master_profit_floor: plan.masterProfitFloor,
    closed_at: plan.closedAt,
    close_reason: plan.closeReason,
    updated_at: new Date().toISOString(),
  };
}

// ---- reads -------------------------------------------------------------

export async function getTradePlan(
  supabase: SupabaseClient,
  userId: string,
  planId: string,
): Promise<TradePlan | null> {
  const { data: planRow, error: planErr } = await supabase
    .from("trade_plans")
    .select("*")
    .eq("user_id", userId)
    .eq("plan_id", planId)
    .maybeSingle();
  if (planErr) throw new Error(planErr.message);
  if (!planRow) return null;

  const { data: auditRows, error: auditErr } = await supabase
    .from("trade_plan_audit")
    .select("*")
    .eq("plan_id", planId);
  if (auditErr) throw new Error(auditErr.message);

  return rowToPlan(planRow, auditRows ?? []);
}

export async function listTradePlans(
  supabase: SupabaseClient,
  userId: string,
  filter?: { state?: PlanState },
): Promise<TradePlan[]> {
  let query = supabase
    .from("trade_plans")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (filter?.state) query = query.eq("state", filter.state);

  const { data: planRows, error: planErr } = await query;
  if (planErr) throw new Error(planErr.message);
  if (!planRows || planRows.length === 0) return [];

  const planIds = planRows.map((r) => r.plan_id as string);
  const { data: auditRows, error: auditErr } = await supabase
    .from("trade_plan_audit")
    .select("*")
    .in("plan_id", planIds);
  if (auditErr) throw new Error(auditErr.message);

  const auditByPlan = new Map<string, Record<string, unknown>[]>();
  for (const row of auditRows ?? []) {
    const key = row.plan_id as string;
    const list = auditByPlan.get(key) ?? [];
    list.push(row);
    auditByPlan.set(key, list);
  }

  return planRows.map((row) => rowToPlan(row, auditByPlan.get(row.plan_id as string) ?? []));
}

// ---- writes --------------------------------------------------------------

export async function createTradePlan(
  supabase: SupabaseClient,
  userId: string,
  input: NewTradePlan,
): Promise<TradePlan> {
  const { data, error } = await supabase
    .from("trade_plans")
    .insert(newPlanToRow(userId, input))
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return rowToPlan(data, []);
}

/**
 * `createTradePlan`, but idempotent on `signalFingerprint`: a qualifying
 * signal must create exactly one candidate plan, and a rerun (a retried
 * job, a duplicate scan pass) with the same fingerprint must not create a
 * second one. Enforced at the database level by
 * `trade_plans_signal_fingerprint_idx` (0053_entry_confirmation_lifecycle.sql);
 * this wrapper just makes the conflict a normal, non-throwing outcome
 * instead of a 23505 error the caller has to know to catch.
 *
 * `input.signalFingerprint` must be non-null to dedupe — a null
 * fingerprint always inserts (no uniqueness to enforce), matching the
 * partial index's `where signal_fingerprint is not null`.
 */
export async function createOrGetIdempotentTradePlan(
  supabase: SupabaseClient,
  userId: string,
  input: NewTradePlan,
): Promise<{ plan: TradePlan; created: boolean }> {
  const { data, error } = await supabase
    .from("trade_plans")
    .insert(newPlanToRow(userId, input))
    .select("*")
    .single();
  if (!error) return { plan: rowToPlan(data, []), created: true };

  const isUniqueViolation = error.code === "23505";
  if (!isUniqueViolation || input.signalFingerprint == null) {
    throw new Error(error.message);
  }

  const { data: existingRow, error: findErr } = await supabase
    .from("trade_plans")
    .select("*")
    .eq("user_id", userId)
    .eq("instrument", input.instrument)
    .eq("timeframe", input.timeframe)
    .eq("strategy_version", input.strategyVersion)
    .eq("signal_fingerprint", input.signalFingerprint)
    .single();
  if (findErr || !existingRow) throw new Error(error.message);
  return { plan: rowToPlan(existingRow, []), created: false };
}

/**
 * Applies one lifecycle event to a persisted plan: loads the current row,
 * runs it through the pure `applyPlanEvent` reducer, then writes back the
 * plan's mutable columns and the one new audit row the event produced (a
 * `mark_price` event bumps no version and appends no audit row).
 */
export async function applyEventAndPersist(
  supabase: SupabaseClient,
  userId: string,
  planId: string,
  event: PlanEvent,
): Promise<TransitionResult | { ok: false; error: "not_found" }> {
  const plan = await getTradePlan(supabase, userId, planId);
  if (!plan) return { ok: false, error: "not_found" };

  const result = applyPlanEvent(plan, event);
  if (!result.ok) return result;

  const { error: updateErr } = await supabase
    .from("trade_plans")
    .update(planToUpdateRow(result.plan))
    .eq("user_id", userId)
    .eq("plan_id", planId);
  if (updateErr) throw new Error(updateErr.message);

  if (result.plan.version > plan.version) {
    const newEntry = result.plan.audit.at(-1)!;
    const { error: auditErr } = await supabase.from("trade_plan_audit").insert({
      plan_id: planId,
      user_id: userId,
      version: newEntry.version,
      at: newEntry.at,
      kind: newEntry.kind,
      from_state: newEntry.fromState,
      to_state: newEntry.toState,
      reason: newEntry.reason,
      risk_increased: newEntry.riskIncreased,
      user_confirmed: newEntry.userConfirmed,
    });
    if (auditErr) throw new Error(auditErr.message);
  }

  return result;
}

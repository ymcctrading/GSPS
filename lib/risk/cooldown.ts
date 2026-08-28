/**
 * Cooldown action gating and reset checklist.
 *
 * Two rules from the spec that must never be bypassed, encoded structurally
 * rather than left to callers to remember:
 *   - A cooldown/lock never blocks a stop loss, take profit, position
 *     reduction, position closure, or cancellation of a pending entry — see
 *     `ALWAYS_PERMITTED_ACTIONS`.
 *   - A paid upgrade never overrides an active cooldown or lock — `gateAction`
 *     takes no tier/entitlement parameter at all, so there is nothing for a
 *     caller to pass that would let one through.
 */

import {
  ALWAYS_PERMITTED_ACTIONS,
  type AlwaysPermittedAction,
  type CircuitState,
} from "@/lib/risk/config";
import { resolveState, type CircuitDecision } from "@/lib/risk/circuit-breaker";
import type { CircuitInputs, PriorState } from "@/lib/risk/circuit-breaker";

export type TradeAction =
  | AlwaysPermittedAction
  | "new_entry"
  | "position_increase";

export interface GateResult {
  allowed: boolean;
  requiresRiskReview: boolean;
  reason: string | null;
  circuit: CircuitDecision;
}

/**
 * Whether `action` may proceed under the current circuit-breaker state. Risk-
 * reducing actions are always allowed regardless of state; a new entry or an
 * increase to an existing position is gated by the state's own rules.
 */
export function gateAction(
  action: TradeAction,
  inputs: CircuitInputs,
  prior?: PriorState,
  tradingDaysElapsedSince?: (from: Date) => number,
): GateResult {
  const circuit = resolveState(inputs, prior, tradingDaysElapsedSince);

  if (ALWAYS_PERMITTED_ACTIONS.has(action as AlwaysPermittedAction)) {
    return { allowed: true, requiresRiskReview: false, reason: null, circuit };
  }

  if (action === "new_entry") {
    if (!circuit.newEntriesAllowed) {
      return { allowed: false, requiresRiskReview: false, reason: circuit.reason, circuit };
    }
    return {
      allowed: true,
      requiresRiskReview: circuit.newEntryRequiresRiskReview,
      reason: circuit.newEntryRequiresRiskReview ? circuit.reason : null,
      circuit,
    };
  }

  // position_increase: treated as a new entry's worth of risk added to an
  // existing symbol, so it is gated the same way and additionally blocked
  // once the state restricts existing positions to risk-reducing actions.
  if (!circuit.newEntriesAllowed || circuit.existingPositionsRestrictedToRiskReduction) {
    return { allowed: false, requiresRiskReview: false, reason: circuit.reason, circuit };
  }
  return {
    allowed: true,
    requiresRiskReview: circuit.newEntryRequiresRiskReview,
    reason: circuit.newEntryRequiresRiskReview ? circuit.reason : null,
    circuit,
  };
}

/** The reset checklist required before new entries resume out of hard_cooldown or a lock. */
export interface ResetChecklist {
  accountValue: number;
  currentOpenRiskUsd: number;
  ruleBreach: string | null;
  correlationExposure: string;
  revisedPlan: string;
}

export interface ResetChecklistValidation {
  complete: boolean;
  missingFields: string[];
}

/** All four fields must be present; `ruleBreach` may legitimately be null (no breach occurred). */
export function validateResetChecklist(checklist: Partial<ResetChecklist>): ResetChecklistValidation {
  const missing: string[] = [];
  if (!(typeof checklist.accountValue === "number" && Number.isFinite(checklist.accountValue))) {
    missing.push("accountValue");
  }
  if (!(typeof checklist.currentOpenRiskUsd === "number" && Number.isFinite(checklist.currentOpenRiskUsd))) {
    missing.push("currentOpenRiskUsd");
  }
  if (checklist.ruleBreach === undefined) missing.push("ruleBreach");
  if (!checklist.correlationExposure || checklist.correlationExposure.trim() === "") {
    missing.push("correlationExposure");
  }
  if (!checklist.revisedPlan || checklist.revisedPlan.trim() === "") {
    missing.push("revisedPlan");
  }
  return { complete: missing.length === 0, missingFields: missing };
}

/**
 * States that require a completed reset checklist before new entries may
 * resume, even once the state's own duration hold has elapsed.
 */
export function requiresResetChecklist(state: CircuitState): boolean {
  return (
    state === "hard_cooldown" ||
    state === "critical_lock" ||
    state === "emergency_lock" ||
    state === "severe_override"
  );
}

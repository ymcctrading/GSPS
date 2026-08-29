/**
 * Audit records for circuit-breaker state transitions.
 *
 * Every transition needs: timestamp, the metric inputs that produced it,
 * source-data confidence (verified broker data vs. a user-entered estimate),
 * whether/how the user was notified, and any acknowledgement they gave. This
 * module only shapes the record; persistence is the caller's — see
 * supabase/migrations for the `risk_circuit_audit_log` table this is written
 * to.
 */

import type { CircuitDecision, CircuitInputs } from "@/lib/risk/circuit-breaker";
import type { CircuitState } from "@/lib/risk/config";

export type SourceDataConfidence = "verified" | "estimate" | "stale";

export interface CircuitAuditRecord {
  userId: string;
  timestamp: string; // ISO 8601
  priorState: CircuitState | null;
  newState: CircuitState;
  reason: string;
  metricInputs: CircuitInputs;
  sourceDataConfidence: SourceDataConfidence;
  userNotified: boolean;
  /** ISO 8601 timestamp of acknowledgement, or null if none was required/given yet. */
  userAcknowledgedAt: string | null;
}

export function buildAuditRecord(params: {
  userId: string;
  priorState: CircuitState | null;
  decision: CircuitDecision;
  metricInputs: CircuitInputs;
  sourceDataConfidence: SourceDataConfidence;
  userNotified: boolean;
  userAcknowledgedAt?: string | null;
  now?: Date;
}): CircuitAuditRecord {
  return {
    userId: params.userId,
    timestamp: (params.now ?? new Date()).toISOString(),
    priorState: params.priorState,
    newState: params.decision.state,
    reason: params.decision.reason,
    metricInputs: params.metricInputs,
    sourceDataConfidence: params.sourceDataConfidence,
    userNotified: params.userNotified,
    userAcknowledgedAt: params.userAcknowledgedAt ?? null,
  };
}

/** Whether a transition is worth writing a new audit row for — a state that hasn't changed is not a transition. */
export function isTransition(priorState: CircuitState | null, newState: CircuitState): boolean {
  return priorState !== newState;
}

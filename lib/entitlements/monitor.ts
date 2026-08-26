/**
 * Phase 3E: the Watch -> Execute monitor state machine, as pure decision
 * logic -- no database access here, so the cooldown/re-arm/invalidation
 * rules can be tested directly. lib/entitlements/monitor-store.ts is the
 * database-backed wrapper that calls this with real monitor rows.
 *
 * Required state machine (GSPS_TIER_ENTITLEMENT_SPEC.md):
 *   WATCH -> EXECUTE -> (INVALIDATED | EXPIRED | NO_SETUP)
 *   WATCH -> INVALIDATED | EXPIRED | NO_SETUP
 *   INVALIDATED/EXPIRED/NO_SETUP -> WATCH -> EXECUTE (a new valid transition)
 *
 * Notify only on a confirmed WATCH -> EXECUTE transition; never re-alert an
 * EXECUTE until the setup leaves EXECUTE, returns to WATCH, and reconfirms
 * EXECUTE; a newer (out-of-order) evaluation must not overwrite a fresher
 * one; a WATCH -> EXECUTE flap within the cooldown window is suppressed
 * rather than applied.
 */

export type MonitorState = "WATCH" | "EXECUTE" | "INVALIDATED" | "NO_SETUP" | "EXPIRED";

export type TransitionDecision =
  | { apply: false; reason: "stale_evaluation" | "cooldown" }
  | { apply: true; isNewMonitor: boolean; isTransition: boolean; notify: boolean };

/** 15 minutes. A product-tunable default, not a spec-mandated number -- callers may override. */
export const DEFAULT_COOLDOWN_MS = 15 * 60 * 1000;

export function decideTransition(args: {
  /** `null` means no open monitor exists yet for this profile+symbol. */
  priorState: MonitorState | null;
  priorEvaluatedAt: Date | null;
  candidateState: MonitorState;
  candidateEvaluatedAt: Date;
  /** When this monitor last held EXECUTE, from monitor_transitions -- `null` if it never has. */
  lastExecuteAt: Date | null;
  cooldownMs: number;
}): TransitionDecision {
  const { priorState, priorEvaluatedAt, candidateState, candidateEvaluatedAt, lastExecuteAt, cooldownMs } = args;

  // Out-of-order or duplicate evaluation: never regress a monitor to an
  // older read of the world, regardless of what state either one carries.
  if (priorEvaluatedAt && candidateEvaluatedAt.getTime() <= priorEvaluatedAt.getTime()) {
    return { apply: false, reason: "stale_evaluation" };
  }

  if (priorState === null) {
    // A brand-new monitor. Not a "transition" -- there is no prior WATCH to
    // have reconfirmed out of, so this never notifies even if it is born
    // directly into EXECUTE.
    return { apply: true, isNewMonitor: true, isTransition: false, notify: false };
  }

  if (priorState === candidateState) {
    // Same read as last time -- refresh last_evaluated_at, but there is no
    // state change to log as a transition.
    return { apply: true, isNewMonitor: false, isTransition: false, notify: false };
  }

  if (priorState === "WATCH" && candidateState === "EXECUTE" && lastExecuteAt) {
    const sinceLastExecute = candidateEvaluatedAt.getTime() - lastExecuteAt.getTime();
    if (sinceLastExecute < cooldownMs) {
      // Flapping: this monitor left EXECUTE too recently to trust a fresh
      // EXECUTE read yet. Suppressed entirely, not merely un-notified --
      // the monitor stays at its current state until a later evaluation
      // clears the cooldown.
      return { apply: false, reason: "cooldown" };
    }
  }

  return {
    apply: true,
    isNewMonitor: false,
    isTransition: true,
    notify: priorState === "WATCH" && candidateState === "EXECUTE",
  };
}

/**
 * Idempotency key for monitor_transitions. `evaluationId` should be stable
 * across retries of the *same* logical evaluation (e.g. a scan_executions
 * row's id) -- not a fresh value per call -- so a retried or duplicated
 * evaluation attempt lands the same transition once, via the table's unique
 * constraint on this column, rather than by trusting caller-side logic.
 */
export function buildTransitionKey(args: {
  profileId: string;
  symbol: string;
  evaluationId: string;
  candidateState: MonitorState;
}): string {
  return `${args.profileId}:${args.symbol.toUpperCase()}:${args.evaluationId}:${args.candidateState}`;
}

/**
 * Circuit-breaker state machine.
 *
 * Evaluated fresh on every call from the three independent loss/drawdown
 * metrics plus today's new-position count — it is never read from a stored
 * "current state" field and incremented, because a metric can improve (a
 * loss ages out of the 48h window) as well as worsen, and the state must
 * track that in both directions. The one exception is duration-gated states
 * (hard cooldown and above): once triggered, they hold for their trading-day
 * count from `triggeredAt` regardless of whether the metric that triggered
 * them has since recovered — see `resolveState`.
 *
 * Severity order matters: `resolveState` returns the single most severe
 * state whose trigger condition holds, since a user in emergency-lock
 * territory is also, trivially, in warning territory.
 */

import {
  type CircuitState,
  CIRCUIT_STATE_ORDER,
  EXISTING_POSITIONS_RESTRICTED,
  MAX_NEW_POSITIONS_PER_DAY,
  WARNING_48H_LOSS_PCT,
  SOFT_COOLDOWN_48H_LOSS_PCT,
  HARD_COOLDOWN_48H_LOSS_PCT,
  CRITICAL_LOCK_30D_DRAWDOWN_PCT,
  EMERGENCY_LOCK_30D_DRAWDOWN_PCT,
  SEVERE_OVERRIDE_30D_DRAWDOWN_PCT,
  HARD_COOLDOWN_BLOCKED_DAYS,
  CRITICAL_LOCK_BLOCKED_DAYS,
  EMERGENCY_LOCK_BLOCKED_DAYS,
} from "@/lib/risk/config";

export interface CircuitInputs {
  newPositionsOpenedToday: number;
  loss48hPct: number;
  drawdown30dPct: number;
}

/**
 * The numeric knobs `resolveState` reads, isolated from the rest of
 * lib/risk/config.ts so a caller can pass a `policy_values`-resolved
 * override (see lib/risk/policy.ts) without touching the state machine's
 * structural constants (state order, which states restrict existing
 * positions). Defaults are the same module-level constants this file always
 * used, so every existing call site is unaffected.
 */
export interface CircuitThresholds {
  maxNewPositionsPerDay: number;
  warning48hLossPct: number;
  softCooldown48hLossPct: number;
  hardCooldown48hLossPct: number;
  criticalLock30dDrawdownPct: number;
  emergencyLock30dDrawdownPct: number;
  severeOverride30dDrawdownPct: number;
  hardCooldownBlockedDays: number;
  criticalLockBlockedDays: number;
  emergencyLockBlockedDays: number;
}

export const DEFAULT_CIRCUIT_THRESHOLDS: CircuitThresholds = {
  maxNewPositionsPerDay: MAX_NEW_POSITIONS_PER_DAY,
  warning48hLossPct: WARNING_48H_LOSS_PCT,
  softCooldown48hLossPct: SOFT_COOLDOWN_48H_LOSS_PCT,
  hardCooldown48hLossPct: HARD_COOLDOWN_48H_LOSS_PCT,
  criticalLock30dDrawdownPct: CRITICAL_LOCK_30D_DRAWDOWN_PCT,
  emergencyLock30dDrawdownPct: EMERGENCY_LOCK_30D_DRAWDOWN_PCT,
  severeOverride30dDrawdownPct: SEVERE_OVERRIDE_30D_DRAWDOWN_PCT,
  hardCooldownBlockedDays: HARD_COOLDOWN_BLOCKED_DAYS,
  criticalLockBlockedDays: CRITICAL_LOCK_BLOCKED_DAYS,
  emergencyLockBlockedDays: EMERGENCY_LOCK_BLOCKED_DAYS,
};

/** A state that already held, so a duration-gated hold can be checked against when it started. */
export interface PriorState {
  state: CircuitState;
  triggeredAt: Date;
}

export interface CircuitDecision {
  state: CircuitState;
  /** Which trigger produced this state — for the audit record and the copy shown to the user. */
  reason: string;
  newEntriesAllowed: boolean;
  /** True only in "warning": a new entry is allowed, but only after an explicit risk review (or the account's optional stricter policy). */
  newEntryRequiresRiskReview: boolean;
  /** False (fully manageable) unless the state restricts existing positions to risk-reducing actions only. */
  existingPositionsRestrictedToRiskReduction: boolean;
  /** Trading days remaining in a duration-gated hold; null when the state has no fixed duration or none was supplied. */
  blockedTradingDaysRemaining: number | null;
}

function severityIndex(state: CircuitState): number {
  return CIRCUIT_STATE_ORDER.indexOf(state);
}

/** The state a fresh read of the metrics alone (no duration hold) would produce. */
function stateFromMetrics(inputs: CircuitInputs, t: CircuitThresholds): { state: CircuitState; reason: string } {
  if (inputs.drawdown30dPct >= t.severeOverride30dDrawdownPct) {
    return { state: "severe_override", reason: `30-day high-water drawdown reached ${inputs.drawdown30dPct.toFixed(1)}% (>= ${t.severeOverride30dDrawdownPct}%).` };
  }
  if (inputs.drawdown30dPct >= t.emergencyLock30dDrawdownPct) {
    return { state: "emergency_lock", reason: `30-day high-water drawdown reached ${inputs.drawdown30dPct.toFixed(1)}% (>= ${t.emergencyLock30dDrawdownPct}%).` };
  }
  if (inputs.drawdown30dPct >= t.criticalLock30dDrawdownPct) {
    return { state: "critical_lock", reason: `30-day high-water drawdown reached ${inputs.drawdown30dPct.toFixed(1)}% (>= ${t.criticalLock30dDrawdownPct}%).` };
  }
  if (inputs.loss48hPct >= t.hardCooldown48hLossPct) {
    return { state: "hard_cooldown", reason: `48h loss reached ${inputs.loss48hPct.toFixed(1)}% (>= ${t.hardCooldown48hLossPct}%).` };
  }
  if (inputs.loss48hPct >= t.softCooldown48hLossPct) {
    return { state: "soft_cooldown", reason: `48h loss reached ${inputs.loss48hPct.toFixed(1)}% (>= ${t.softCooldown48hLossPct}%).` };
  }
  if (inputs.loss48hPct >= t.warning48hLossPct) {
    return { state: "warning", reason: `48h loss reached ${inputs.loss48hPct.toFixed(1)}% (>= ${t.warning48hLossPct}%).` };
  }
  if (inputs.newPositionsOpenedToday >= t.maxNewPositionsPerDay) {
    return { state: "entry_pause", reason: `${inputs.newPositionsOpenedToday} new positions opened today (>= ${t.maxNewPositionsPerDay}).` };
  }
  return { state: "normal", reason: "No trigger." };
}

function blockedDaysByState(t: CircuitThresholds): Partial<Record<CircuitState, number>> {
  return {
    hard_cooldown: t.hardCooldownBlockedDays,
    critical_lock: t.criticalLockBlockedDays,
    emergency_lock: t.emergencyLockBlockedDays,
  };
}

/**
 * Resolves the circuit-breaker state. `prior` and `tradingDaysElapsedSince`
 * are optional: pass both to honor a duration-gated hold (a hard cooldown
 * blocking through the *next full trading day* even if the loss that
 * triggered it has since fallen below threshold); omit either to get a pure
 * metrics read, which is what a first-ever evaluation for a user is.
 * `thresholds` defaults to the code-default constants; pass a
 * `policy_values`-resolved `CircuitThresholds` (lib/risk/policy.ts) to honor
 * a remotely configured override.
 */
export function resolveState(
  inputs: CircuitInputs,
  prior?: PriorState,
  tradingDaysElapsedSince?: (from: Date) => number,
  thresholds: CircuitThresholds = DEFAULT_CIRCUIT_THRESHOLDS,
): CircuitDecision {
  const fresh = stateFromMetrics(inputs, thresholds);
  const BLOCKED_DAYS = blockedDaysByState(thresholds);

  let state = fresh.state;
  let reason = fresh.reason;
  let blockedTradingDaysRemaining: number | null = null;

  const priorDuration = prior ? BLOCKED_DAYS[prior.state] : undefined;
  if (prior && priorDuration != null && tradingDaysElapsedSince) {
    const elapsed = tradingDaysElapsedSince(prior.triggeredAt);
    const remaining = Math.max(0, priorDuration - elapsed);
    if (remaining > 0 && severityIndex(prior.state) >= severityIndex(fresh.state)) {
      // The hold is still running and at least as severe as a fresh read —
      // stay in it rather than letting the metric's recovery end it early.
      state = prior.state;
      reason = `Held from prior trigger (${prior.state}); ${remaining} trading day(s) remaining.`;
      blockedTradingDaysRemaining = remaining;
    }
  }
  if (blockedTradingDaysRemaining === null) {
    const duration = BLOCKED_DAYS[state];
    if (duration != null) blockedTradingDaysRemaining = duration;
  }

  return {
    state,
    reason,
    newEntriesAllowed: state === "normal" || state === "warning",
    newEntryRequiresRiskReview: state === "warning",
    existingPositionsRestrictedToRiskReduction: EXISTING_POSITIONS_RESTRICTED[state],
    blockedTradingDaysRemaining,
  };
}

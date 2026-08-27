/**
 * Phase 3E: database-backed monitor evaluation, built on the pure decision
 * logic in lib/entitlements/monitor.ts. Always called with a service-role
 * client -- active_monitors/monitor_transitions have no client-write RLS
 * policy (migration 0036), by design.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildTransitionKey,
  decideTransition,
  DEFAULT_COOLDOWN_MS,
  type MonitorState,
} from "@/lib/entitlements/monitor";
import type { Limit } from "@/lib/entitlements/policy";

export type MonitorEvaluationResult =
  | { outcome: "skipped"; reason: "stale_evaluation" | "cooldown" }
  | { outcome: "capacity_exceeded" }
  | { outcome: "applied"; monitorId: string; transitionId: string | null; notify: boolean };

function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

/**
 * Safety ceiling applied even for a tier whose policy limit is "unlimited"
 * (Wall Street) -- the spec calls this out explicitly as "unlimited/
 * fair-use", not literally unbounded. A single profile accumulating
 * unbounded open monitors is a real cost (every scheduled/manual scan
 * re-evaluates every open monitor) regardless of what tier is paying for
 * it. High enough that no real Wall Street usage pattern should hit it.
 */
export const FAIR_USE_MAX_ACTIVE_MONITORS = 1000;

/**
 * Evaluates one profile+symbol against a candidate monitor state and
 * applies whatever lib/entitlements/monitor.ts's `decideTransition` decides
 * -- create, update, or no-op. `evaluationId` should be the same stable
 * value (e.g. a scan_executions row's id) across any retry of this exact
 * evaluation, so a duplicate call lands the same transition once rather
 * than twice.
 */
export async function evaluateMonitor(
  service: SupabaseClient,
  args: {
    profileId: string;
    symbol: string;
    source: string;
    candidateState: MonitorState;
    evaluationId: string;
    maxActiveWatchMonitors: Limit;
    now?: Date;
    cooldownMs?: number;
    expiresAt?: string | null;
  },
): Promise<MonitorEvaluationResult> {
  const now = args.now ?? new Date();
  const cooldownMs = args.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  const symbol = args.symbol.toUpperCase();

  const { data: existing } = await service
    .from("active_monitors")
    .select("id, state, last_evaluated_at")
    .eq("profile_id", args.profileId)
    .eq("symbol", symbol)
    .in("state", ["WATCH", "EXECUTE"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const priorState = (existing?.state as MonitorState | undefined) ?? null;
  const priorEvaluatedAt = existing?.last_evaluated_at ? new Date(existing.last_evaluated_at) : null;

  let lastExecuteAt: Date | null = null;
  if (existing && priorState === "WATCH" && args.candidateState === "EXECUTE") {
    const { data: lastExecute } = await service
      .from("monitor_transitions")
      .select("occurred_at")
      .eq("monitor_id", existing.id)
      .eq("new_state", "EXECUTE")
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    lastExecuteAt = lastExecute ? new Date(lastExecute.occurred_at) : null;
  }

  const decision = decideTransition({
    priorState,
    priorEvaluatedAt,
    candidateState: args.candidateState,
    candidateEvaluatedAt: now,
    lastExecuteAt,
    cooldownMs,
  });

  if (!decision.apply) {
    if (existing) {
      await service
        .from("active_monitors")
        .update({ last_suppressed_reason: decision.reason, last_suppressed_at: now.toISOString() })
        .eq("id", existing.id);
    }
    return { outcome: "skipped", reason: decision.reason };
  }

  if (decision.isNewMonitor) {
    const effectiveCapacity =
      args.maxActiveWatchMonitors === "unlimited" ? FAIR_USE_MAX_ACTIVE_MONITORS : args.maxActiveWatchMonitors;
    const { count } = await service
      .from("active_monitors")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", args.profileId)
      .in("state", ["WATCH", "EXECUTE"]);
    if ((count ?? 0) >= effectiveCapacity) {
      return { outcome: "capacity_exceeded" };
    }
  }

  let monitorId: string;
  if (decision.isNewMonitor) {
    const { data: inserted, error } = await service
      .from("active_monitors")
      .insert({
        profile_id: args.profileId,
        symbol,
        source: args.source,
        state: args.candidateState,
        last_evaluated_at: now.toISOString(),
        expires_at: args.expiresAt ?? null,
      })
      .select("id")
      .single();
    if (error || !inserted) {
      // Lost a race to create this monitor (the partial unique index on
      // profile_id+symbol for an open state rejected the concurrent
      // insert) -- not an error, just deferred to the next evaluation,
      // which will see it as `existing`.
      return { outcome: "skipped", reason: "stale_evaluation" };
    }
    monitorId = inserted.id;
  } else {
    monitorId = existing!.id;
    await service
      .from("active_monitors")
      .update({
        state: args.candidateState,
        last_evaluated_at: now.toISOString(),
        // A successful apply clears any suppression left over from an
        // earlier cooldown/stale-evaluation skip -- that record described a
        // decision this evaluation has now superseded.
        last_suppressed_reason: null,
        last_suppressed_at: null,
      })
      .eq("id", monitorId);
  }

  if (!decision.isTransition) {
    return { outcome: "applied", monitorId, transitionId: null, notify: false };
  }

  const transitionKey = buildTransitionKey({
    profileId: args.profileId,
    symbol,
    evaluationId: args.evaluationId,
    candidateState: args.candidateState,
  });

  const { data: transition, error: transitionError } = await service
    .from("monitor_transitions")
    .insert({
      monitor_id: monitorId,
      profile_id: args.profileId,
      prior_state: priorState,
      new_state: args.candidateState,
      transition_key: transitionKey,
      // Explicit rather than relying on the table's `default now()` --
      // this should reflect when the evaluation determined the state, which
      // is what a later cooldown lookup (`lastExecuteAt`, above) needs to
      // measure against, not whenever this row happens to reach the DB.
      occurred_at: now.toISOString(),
    })
    .select("id")
    .single();

  if (transitionError) {
    if (isUniqueViolation(transitionError)) {
      // This exact transition was already recorded by a concurrent or
      // retried evaluation -- idempotent no-op.
      return { outcome: "applied", monitorId, transitionId: null, notify: false };
    }
    throw new Error(`evaluateMonitor: ${transitionError.message}`);
  }

  return { outcome: "applied", monitorId, transitionId: transition!.id, notify: decision.notify };
}

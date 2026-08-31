/**
 * Wiring the pure lib/risk/* engine to a real *live* brokerage account.
 *
 * Everything above this file (config, account, dynamic-risk, execution-score,
 * metrics, circuit-breaker, cooldown, audit, position-limits) is pure and
 * stateless by design. This module is the one place that reads and writes
 * Supabase: it snapshots live equity (from `lib/risk/live-account.ts` only —
 * never the paper simulator, since the spec's rules do not apply to paper
 * trading), derives the three loss/drawdown metrics from the snapshot
 * history, resolves the circuit-breaker state against whatever was
 * previously stored, and persists both the current state and an audit row on
 * every transition.
 *
 * Callers: today this is wired into `lib/trade/place-order.ts`'s
 * `mode === "live"` branch, which itself still hard-refuses every live order
 * ("Live trading requires a connected live brokerage in Settings.") because
 * GSPS has no live order-execution path yet (see ROADMAP.md — "Live trading
 * is not enabled: it needs per-user brokerage credentials, which is
 * unscheduled work"). The gate runs and persists real state regardless, so
 * the moment live execution is built, it is already there rather than a
 * second integration pass — see the call site for the exact seam.
 *
 * Scope note: `newPositionsOpenedToday` has no live-order history to count
 * from yet (there is no live order history at all — see above), so callers
 * pass 0 until one exists. That means `entry_pause` cannot trigger from live
 * trading today; the loss/drawdown-driven states (warning through
 * severe_override) are unaffected, since they are computed from the equity
 * snapshot history in this file, not from a position count.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { rolling48hLoss, rollingHighWaterDrawdown, startOfDayLoss, type EquitySample } from "@/lib/risk/metrics";
import { resolveState, type CircuitDecision, type PriorState } from "@/lib/risk/circuit-breaker";
import { buildAuditRecord, isTransition, type SourceDataConfidence } from "@/lib/risk/audit";
import type { CircuitState } from "@/lib/risk/config";
import { getRiskPolicy } from "@/lib/risk/policy";
import { etDateKey, etParts } from "@/lib/market/session";

/** Snapshots are throttled to at most one every this many minutes per user. */
const SNAPSHOT_MIN_INTERVAL_MINUTES = 15;

/**
 * Records a live equity mark, unless one was already recorded inside the
 * throttle window. Best-effort: a failure here degrades the metrics (a
 * sparser sample series) rather than the request that triggered it, so
 * errors are swallowed after being logged.
 */
export async function recordLiveEquitySnapshot(
  supabase: SupabaseClient,
  userId: string,
  equity: number,
  verified: boolean,
  now: Date = new Date(),
): Promise<void> {
  if (!(equity >= 0) || !Number.isFinite(equity)) return;

  const cutoff = new Date(now.getTime() - SNAPSHOT_MIN_INTERVAL_MINUTES * 60_000).toISOString();
  const { data: recent } = await supabase
    .from("risk_live_equity_snapshots")
    .select("id")
    .eq("profile_id", userId)
    .gte("recorded_at", cutoff)
    .limit(1);
  if ((recent ?? []).length > 0) return;

  const { error } = await supabase
    .from("risk_live_equity_snapshots")
    .insert({ profile_id: userId, equity, verified, recorded_at: now.toISOString() });
  if (error) console.error(`risk: live equity snapshot not recorded — ${error.message}`);
}

interface SnapshotRow {
  equity: number;
  verified: boolean;
  recorded_at: string;
}

/** Snapshots from the trailing 30 days, oldest first — the widest window any metric here reads. */
async function readEquitySamples(
  supabase: SupabaseClient,
  userId: string,
  now: Date,
): Promise<{ samples: EquitySample[]; anyUnverified: boolean }> {
  const since = new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString();
  const { data } = await supabase
    .from("risk_live_equity_snapshots")
    .select("equity, verified, recorded_at")
    .eq("profile_id", userId)
    .gte("recorded_at", since)
    .order("recorded_at", { ascending: true });

  const rows = (data ?? []) as SnapshotRow[];
  return {
    samples: rows.map((r) => ({ at: new Date(r.recorded_at), equity: r.equity })),
    anyUnverified: rows.some((r) => !r.verified),
  };
}

/** The last equity mark before the current ET trading day began (approximated as the prior day's 20:00 ET close). */
function sessionStart(now: Date): Date {
  const { minutes } = etParts(now);
  const msSinceMidnightEt = minutes * 60_000;
  const startOfTodayEt = new Date(now.getTime() - msSinceMidnightEt);
  return new Date(startOfTodayEt.getTime() - 4 * 3600_000); // 20:00 ET the evening before
}

/** Distinct ET weekdays (Mon-Fri) strictly between `from` and `to` — a holiday-agnostic trading-day count, matching lib/market/session.ts's own posture. */
function tradingDaysElapsed(from: Date, to: Date): number {
  if (to.getTime() <= from.getTime()) return 0;
  let count = 0;
  const seen = new Set<string>();
  const cursor = new Date(from.getTime());
  while (cursor.getTime() < to.getTime()) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (cursor.getTime() > to.getTime()) break;
    const { weekday } = etParts(cursor);
    const key = etDateKey(cursor);
    if (weekday !== 0 && weekday !== 6 && !seen.has(key)) {
      seen.add(key);
      count++;
    }
  }
  return count;
}

interface StoredCircuitState {
  state: CircuitState;
  triggered_at: string;
}

export interface CircuitEvaluation {
  decision: CircuitDecision;
  loss48hPct: number;
  startOfDayLossPct: number;
  drawdown30dPct: number;
  sourceDataConfidence: SourceDataConfidence;
}

/**
 * The full read-compute-persist cycle for one user's live account: snapshot
 * current equity, derive the three metrics from the snapshot history,
 * resolve the circuit-breaker state against whatever was previously stored,
 * and write the new state plus an audit row whenever the state actually
 * changes.
 *
 * `equity`/`equityVerified` must come from `lib/risk/live-account.ts` — a
 * paper/simulated mark passed here would apply these rules to paper trading,
 * which the spec explicitly excludes.
 */
export async function evaluateLiveCircuitBreaker(
  supabase: SupabaseClient,
  userId: string,
  equity: number,
  equityVerified: boolean,
  newPositionsOpenedToday: number,
  now: Date = new Date(),
): Promise<CircuitEvaluation> {
  await recordLiveEquitySnapshot(supabase, userId, equity, equityVerified, now);

  const policy = await getRiskPolicy(supabase);
  const { samples, anyUnverified } = await readEquitySamples(supabase, userId, now);
  // Include the just-recorded (or just-throttled-away) current mark so a
  // brand-new account with one sample still gets a well-defined 0% loss
  // rather than an empty-window read.
  const withCurrent = [...samples, { at: now, equity }];

  const loss48h = rolling48hLoss(withCurrent, now);
  const sod = startOfDayLoss(withCurrent, sessionStart(now), now);
  const drawdown30d = rollingHighWaterDrawdown(withCurrent, now);

  const { data: priorRow } = await supabase
    .from("risk_circuit_state")
    .select("state, triggered_at")
    .eq("profile_id", userId)
    .maybeSingle();
  const stored = priorRow as StoredCircuitState | null;
  const prior: PriorState | undefined = stored
    ? { state: stored.state, triggeredAt: new Date(stored.triggered_at) }
    : undefined;

  const decision = resolveState(
    { newPositionsOpenedToday, loss48hPct: loss48h.lossPct, drawdown30dPct: drawdown30d.lossPct },
    prior,
    (from) => tradingDaysElapsed(from, now),
    policy.circuit,
  );

  const sourceDataConfidence: SourceDataConfidence = !equityVerified || anyUnverified ? "estimate" : "verified";
  const priorState = stored?.state ?? null;

  // `isTransition(null, x)` is always true (there is no state to have equalled
  // "null"), so the very first evaluation for a user always takes this branch
  // and `upsert` both creates the row and writes its first audit entry — a
  // separate "insert" branch for that case would be unreachable.
  if (isTransition(priorState, decision.state)) {
    const { error: stateError } = await supabase.from("risk_circuit_state").upsert(
      {
        profile_id: userId,
        state: decision.state,
        triggered_at: now.toISOString(),
        reason: decision.reason,
        updated_at: now.toISOString(),
      },
      { onConflict: "profile_id" },
    );
    if (stateError) console.error(`risk: circuit state not persisted — ${stateError.message}`);

    const audit = buildAuditRecord({
      userId,
      priorState,
      decision,
      metricInputs: { newPositionsOpenedToday, loss48hPct: loss48h.lossPct, drawdown30dPct: drawdown30d.lossPct },
      sourceDataConfidence,
      // No delivery channel is wired yet — the transition is recorded
      // truthfully as not-yet-notified rather than claiming a notification
      // this pass doesn't send.
      userNotified: false,
      now,
    });
    const { error: auditError } = await supabase.from("risk_circuit_audit_log").insert({
      profile_id: audit.userId,
      prior_state: audit.priorState,
      new_state: audit.newState,
      reason: audit.reason,
      metric_inputs: audit.metricInputs,
      source_data_confidence: audit.sourceDataConfidence,
      user_notified: audit.userNotified,
      user_acknowledged_at: audit.userAcknowledgedAt,
      occurred_at: audit.timestamp,
    });
    if (auditError) console.error(`risk: circuit audit row not written — ${auditError.message}`);
  } else {
    // Same state, but the reason/metrics may have moved (e.g. the loss grew
    // within the same band) — refresh the row without touching triggered_at,
    // which duration-gated holds key off.
    const { error } = await supabase
      .from("risk_circuit_state")
      .update({ reason: decision.reason, updated_at: now.toISOString() })
      .eq("profile_id", userId);
    if (error) console.error(`risk: circuit state reason not refreshed — ${error.message}`);
  }

  return {
    decision,
    loss48hPct: loss48h.lossPct,
    startOfDayLossPct: sod.lossPct,
    drawdown30dPct: drawdown30d.lossPct,
    sourceDataConfidence,
  };
}

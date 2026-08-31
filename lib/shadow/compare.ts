/**
 * Shadow-vs-backtest comparison — the "alerts" piece of Phase 7 ("Validation
 * and monitoring"): whether live signal quality is tracking what the
 * backtest harness (lib/backtest/*) predicts for the same strategy version,
 * or has drifted.
 *
 * This module defines the comparison and, on a confirmed drift, both logs a
 * `console.warn` and sends one operational email via
 * `sendOperatorDriftAlertEmail` (best-effort — see that function's doc for
 * why it is not routed through the per-user `notification_deliveries`
 * pipeline, and for what happens when `OPERATOR_ALERT_EMAIL` is unset).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendOperatorDriftAlertEmail } from "@/lib/notifications/resend-handler";

export interface ShadowSummary {
  trades: number;
  winRate: number;
  expectancyR: number;
}

export interface BacktestBaseline {
  trades: number;
  winRate: number;
  expectancyR: number;
}

/**
 * The Execute-tier row from the latest committed `docs/REPLAY_RESULTS.md`
 * (generated 2026-08-27, `npm run backtest`). Hand-transcribed rather than
 * read from the file at runtime — the report is markdown for humans, not a
 * machine-readable artifact, and re-parsing it on every scheduled-scan run
 * would be fragile for no real benefit. Update this constant whenever
 * `docs/REPLAY_RESULTS.md` is regenerated with a materially different
 * Execute-tier row, the same manual-bump discipline
 * `lib/backtest/strategyVersion.ts`'s `STRATEGY_VERSION` already uses for
 * the same reason (a hash would churn on unrelated changes; a human
 * decides when the numbers moved enough to matter).
 */
export const EXECUTE_TIER_BACKTEST_BASELINE: BacktestBaseline = {
  trades: 31,
  winRate: 0.387,
  expectancyR: 0.151,
};

export interface DriftAlert {
  reason: string;
  shadow: ShadowSummary;
  backtest: BacktestBaseline;
  expectancyDeltaR: number;
  winRateDeltaPct: number;
}

/** Below this many evaluated shadow trades, a comparison is noise — withhold rather than false-alarm. */
export const MIN_SHADOW_SAMPLES = 15;

/** Absolute expectancy-R drop (shadow minus backtest) that counts as drift. */
export const EXPECTANCY_DRIFT_THRESHOLD_R = 0.15;

/** Absolute win-rate drop (percentage points, shadow minus backtest) that counts as drift. */
export const WIN_RATE_DRIFT_THRESHOLD_PCT = 15;

interface EvaluatedShadowRow {
  outcome: "win" | "loss" | "timeout";
  r_multiple: number;
}

/** Pure: aggregates already-evaluated shadow rows into a `ShadowSummary`. */
export function summarizeShadowRows(rows: EvaluatedShadowRow[]): ShadowSummary {
  if (rows.length === 0) return { trades: 0, winRate: 0, expectancyR: 0 };
  const wins = rows.filter((r) => r.outcome === "win").length;
  const totalR = rows.reduce((sum, r) => sum + r.r_multiple, 0);
  return {
    trades: rows.length,
    winRate: wins / rows.length,
    expectancyR: totalR / rows.length,
  };
}

/**
 * Pure comparison. Returns `null` when the sample is too small to trust or
 * shadow performance has not meaningfully fallen short of the backtest
 * baseline — silence is the correct default, not a manufactured alert.
 */
export function compareToBacktest(shadow: ShadowSummary, backtest: BacktestBaseline): DriftAlert | null {
  if (shadow.trades < MIN_SHADOW_SAMPLES) return null;

  const expectancyDeltaR = shadow.expectancyR - backtest.expectancyR;
  const winRateDeltaPct = (shadow.winRate - backtest.winRate) * 100;

  const expectancyDrifted = expectancyDeltaR <= -EXPECTANCY_DRIFT_THRESHOLD_R;
  const winRateDrifted = winRateDeltaPct <= -WIN_RATE_DRIFT_THRESHOLD_PCT;
  if (!expectancyDrifted && !winRateDrifted) return null;

  const reasons: string[] = [];
  if (expectancyDrifted) {
    reasons.push(
      `live expectancy ${shadow.expectancyR.toFixed(2)}R is ${Math.abs(expectancyDeltaR).toFixed(2)}R below the ${backtest.expectancyR.toFixed(2)}R backtest baseline`,
    );
  }
  if (winRateDrifted) {
    reasons.push(
      `live win rate ${(shadow.winRate * 100).toFixed(1)}% is ${Math.abs(winRateDeltaPct).toFixed(1)} points below the ${(backtest.winRate * 100).toFixed(1)}% backtest baseline`,
    );
  }

  return {
    reason: reasons.join("; "),
    shadow,
    backtest,
    expectancyDeltaR,
    winRateDeltaPct,
  };
}

/** Minimum time between operator alert emails for a persisting drift — see `shadow_drift_alerts` (migration 0054). */
export const DRIFT_ALERT_COOLDOWN_HOURS = 20;

/**
 * Reads every evaluated shadow signal from the trailing `windowDays` and
 * compares it against `backtest`. On a confirmed drift, always logs a
 * `console.warn`, and sends one operator alert email via
 * `sendOperatorDriftAlertEmail` — unless one was already sent within
 * `DRIFT_ALERT_COOLDOWN_HOURS`, in which case the email is skipped (a
 * persisting drift stays logged every run, but does not re-email the
 * operator every run) while the returned `DriftAlert` and its log line are
 * unaffected either way.
 */
export async function evaluateShadowDrift(
  supabase: SupabaseClient,
  backtest: BacktestBaseline,
  windowDays = 60,
  now: Date = new Date(),
): Promise<DriftAlert | null> {
  const since = new Date(now.getTime() - windowDays * 24 * 3600_000).toISOString();
  const { data, error } = await supabase
    .from("shadow_signals")
    .select("outcome, r_multiple")
    .not("outcome", "is", null)
    .gte("scanned_at", since);

  if (error) {
    console.error(`shadow: drift comparison read failed — ${error.message}`);
    return null;
  }

  const shadow = summarizeShadowRows((data ?? []) as EvaluatedShadowRow[]);
  const alert = compareToBacktest(shadow, backtest);
  if (!alert) return null;

  console.warn(`shadow: signal-quality drift detected — ${alert.reason}`);

  const cooldownCutoff = new Date(now.getTime() - DRIFT_ALERT_COOLDOWN_HOURS * 3600_000).toISOString();
  const { data: recent, error: recentError } = await supabase
    .from("shadow_drift_alerts")
    .select("id")
    .gte("alerted_at", cooldownCutoff)
    .limit(1);

  if (recentError) {
    console.error(`shadow: drift-alert cooldown read failed — ${recentError.message}`);
    return alert;
  }
  if ((recent ?? []).length > 0) {
    return alert;
  }

  await sendOperatorDriftAlertEmail({
    reason: alert.reason,
    shadowTrades: alert.shadow.trades,
    shadowWinRate: alert.shadow.winRate,
    shadowExpectancyR: alert.shadow.expectancyR,
    backtestWinRate: alert.backtest.winRate,
    backtestExpectancyR: alert.backtest.expectancyR,
  });

  const { error: insertError } = await supabase.from("shadow_drift_alerts").insert({
    reason: alert.reason,
    shadow_trades: alert.shadow.trades,
    shadow_expectancy_r: alert.shadow.expectancyR,
    backtest_expectancy_r: alert.backtest.expectancyR,
    alerted_at: now.toISOString(),
  });
  if (insertError) {
    console.error(`shadow: drift-alert record not written — ${insertError.message}`);
  }

  return alert;
}

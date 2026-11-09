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
import { STRATEGY_VERSION } from "@/lib/backtest/strategyVersion";
import { PRODUCTION_REPLAY_RUNS, type ReplayReference } from "@/lib/backtest/replayReference";
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
  /**
   * The strategy version the baseline was measured on. A baseline from another
   * version measured other rules, so the scheduled drift check withholds
   * rather than compare across them (R-032). Absent: the caller vouches for it.
   */
  strategyVersion?: string;
}

/** The outcomes that are trades. `expired` and `retired` never filled (lib/shadow/evaluate.ts). */
export const SHADOW_TRADE_OUTCOMES = ["win", "loss", "timeout"] as const;

/**
 * The baseline the forward test is set beside: the Execute row of the newest
 * committed production-faithful replay (`PRODUCTION_REPLAY_RUNS`, read from
 * `docs/replay-runs/`; the cell is `{"usePlanLevels":true,"entryRule":
 * "reaction","exitRule":"structure"}`). Null when no such run is committed.
 *
 * Until 2026-11-09 this was a hand-typed row from `docs/REPLAY_RESULTS.md` as
 * committed on 2026-08-27 (31 trades, 38.7%, +0.151R on six stocks, a stop
 * entry and a 2R bracket). That file no longer holds the row, and it measured
 * rules no account trades, so it was retired for the committed production
 * cell (numbers audit, `/mnt/project-files/owner/app-numbers-audit.md`).
 *
 * The scheduled drift check still compares only when the run's version is
 * the current `STRATEGY_VERSION` (`evaluateShadowDrift`, R-032): a replay of
 * earlier rules is shown for reference, never used for a drift verdict.
 */
export function currentReplayBaseline(): ReplayReference | null {
  const runs = [...PRODUCTION_REPLAY_RUNS].sort((a, b) => (a.window.to < b.window.to ? 1 : a.window.to > b.window.to ? -1 : 0));
  return runs[0] ?? null;
}

/** The Execute row of `currentReplayBaseline()`, with its version, or null. */
export const EXECUTE_TIER_BACKTEST_BASELINE: BacktestBaseline | null = (() => {
  const run = currentReplayBaseline();
  return run
    ? { trades: run.execute.trades, winRate: run.execute.winRate, expectancyR: run.execute.expectancyR, strategyVersion: run.strategyVersion }
    : null;
})();

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

/** Minimum time between operator alert emails for a persisting drift — see `shadow_drift_alerts` (migration 0055). */
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
  if (backtest.strategyVersion !== undefined && backtest.strategyVersion !== STRATEGY_VERSION) {
    console.info(`shadow: drift check withheld — the baseline was measured on ${backtest.strategyVersion}, not ${STRATEGY_VERSION}`);
    return null;
  }
  const since = new Date(now.getTime() - windowDays * 24 * 3600_000).toISOString();
  const { data, error } = await supabase
    .from("shadow_signals")
    .select("outcome, r_multiple")
    // One version at a time: a sample that mixes strategy versions measures
    // no rule production runs.
    .eq("strategy_version", STRATEGY_VERSION)
    .in("outcome", [...SHADOW_TRADE_OUTCOMES])
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

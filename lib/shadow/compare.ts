/**
 * Shadow-vs-backtest comparison — the "alerts" piece of Phase 7 ("Validation
 * and monitoring"): whether live signal quality is tracking what the
 * backtest harness (lib/backtest/*) predicts for the same strategy version,
 * or has drifted.
 *
 * This module defines the comparison and produces a structured verdict; it
 * does not send anything anywhere. Wiring `DriftAlert` into an actual
 * delivery channel (`lib/notifications/*`) is deliberately left for a
 * follow-up — see docs/CLAUDE_CODE_ROADMAP_TRACKER.md. Emitting a
 * console.warn on a confirmed drift (below) is the one delivery mechanism
 * this PR ships, so a drift is at least visible in server logs today.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

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

/**
 * Reads every evaluated shadow signal from the trailing `windowDays` and
 * compares it against `backtest`. Logs a warning (the one delivery
 * mechanism this PR ships — see module doc) when a drift is confirmed.
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
  if (alert) {
    console.warn(`shadow: signal-quality drift detected — ${alert.reason}`);
  }
  return alert;
}

/**
 * Shadow-mode signal recording — Phase 7 ("Validation and monitoring") of
 * the Claude Code Build Roadmap spec pack.
 *
 * "Shadow" here means exactly what the spec pack means: the live strategy
 * runs against real-time data and its calls are logged, but nothing is
 * executed and nothing about the recording changes what any user sees.
 * Only Execute-tier signals are worth tracking — the same "Execute only"
 * precedent Guided Mode's eligibility gate uses (a Watch/Reject verdict is
 * not a call the strategy is making, so there is nothing to score it
 * against). Recorded from the trusted scheduled scan only
 * (lib/entitlements/scheduled-scan.ts), never a user-initiated scan: this
 * is platform-wide signal-quality tracking, not a per-user record.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ScanResult } from "@/lib/types";
import { STRATEGY_VERSION } from "@/lib/backtest/strategyVersion";

export interface ShadowSignalInsert {
  symbol: string;
  direction: "bullish" | "bearish";
  pattern: string | null;
  strategyVersion: string;
  entry: number;
  stopLoss: number;
  target: number;
  score: number;
  source: string;
  scannedAt: string;
}

/**
 * Builds the row to record for one scan result, or `null` when there is
 * nothing to shadow: not Execute-tier, no priced plan, no clear direction,
 * or the scan itself failed. Pure — no I/O, so it is trivially testable
 * against a fixture `ScanResult` without a database.
 */
export function buildShadowSignal(result: ScanResult, source: string): ShadowSignalInsert | null {
  if (result.error) return null;
  if (result.decision.outputState !== "Execute") return null;
  if (result.direction !== "bullish" && result.direction !== "bearish") return null;
  if (!result.levels) return null;

  return {
    symbol: result.symbol,
    direction: result.direction,
    pattern: result.pattern?.name ?? null,
    strategyVersion: STRATEGY_VERSION,
    entry: result.levels.entry,
    stopLoss: result.levels.stopLoss,
    // The master target, kept for reference only: the walk exits on Gann's
    // rules with no fixed target (lib/shadow/evaluate.ts, R-032).
    target: result.levels.masterProfit,
    score: result.decision.score,
    source,
    scannedAt: result.scannedAt,
  };
}

/**
 * Records every shadow-worthy signal from a batch of scan results.
 * Idempotent via the `(symbol, scanned_at)` unique index (migration 0050):
 * a duplicate insert from a retried job is silently ignored rather than
 * erroring or double-counting. Best-effort — a write failure is logged and
 * swallowed, matching this codebase's posture for telemetry that must not
 * fail the scan it rides along with (see `persistCoarseTelemetry`).
 */
export async function recordShadowSignals(
  supabase: SupabaseClient,
  results: ScanResult[],
  source: string,
): Promise<{ recorded: number }> {
  const rows = results
    .map((r) => buildShadowSignal(r, source))
    .filter((r): r is ShadowSignalInsert => r !== null)
    .map((r) => ({
      symbol: r.symbol,
      direction: r.direction,
      pattern: r.pattern,
      strategy_version: r.strategyVersion,
      entry: r.entry,
      stop_loss: r.stopLoss,
      target: r.target,
      score: r.score,
      source: r.source,
      scanned_at: r.scannedAt,
    }));

  if (rows.length === 0) return { recorded: 0 };

  // The scheduled scans run several times a day and re-find the same plan,
  // so a plan still being walked is recorded once: a repeat on the same
  // version, symbol, side, entry and stop is the same call, not a new one
  // (MU's 900.05/1003 short was counted four times on 2026-10-12). Best
  // effort: if the read fails, record as before.
  const open = new Set<string>();
  const key = (r: { symbol: string; direction: string; entry: number; stop_loss: number }) =>
    `${r.symbol}|${r.direction}|${Number(r.entry)}|${Number(r.stop_loss)}`;
  try {
    const { data } = await supabase
      .from("shadow_signals")
      .select("symbol, direction, entry, stop_loss")
      .eq("strategy_version", STRATEGY_VERSION)
      .is("outcome", null)
      .in("symbol", [...new Set(rows.map((r) => r.symbol))]);
    for (const r of (data ?? []) as { symbol: string; direction: string; entry: number; stop_loss: number }[]) open.add(key(r));
  } catch {
    // Read failed or unsupported: fall through and rely on the unique index.
  }
  const fresh = rows.filter((r) => !open.has(key(r)));
  if (fresh.length === 0) return { recorded: 0 };

  const { error } = await supabase
    .from("shadow_signals")
    .upsert(fresh, { onConflict: "symbol,scanned_at", ignoreDuplicates: true });
  if (error) {
    console.error(`shadow: signal recording failed — ${error.message}`);
    return { recorded: 0 };
  }
  return { recorded: fresh.length };
}

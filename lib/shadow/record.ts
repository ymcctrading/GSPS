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
import { shadowSessionComplete, shadowTradeSession } from "@/lib/shadow/session";
import { walkShadowRows, type PendingShadowRow, type ShadowOutcome } from "@/lib/shadow/evaluate";

export { shadowSessionComplete, shadowTradeSession };

/**
 * Earlier rows the recorder walks itself in one run before deciding whether a
 * re-found plan is a new call. Bounded for the 60-second scan it rides in; an
 * engineering choice.
 */
export const MAX_WALKS_ON_RECORD = 6;

/** How long the recorder waits on those walks before holding the plans back. Engineering choice. */
export const WALK_ON_RECORD_TIMEOUT_MS = 4_000;

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
  /** The New York session the signal trades (`shadowTradeSession`). */
  sessionDate: string;
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
    sessionDate: shadowTradeSession(result.scannedAt, result.symbol),
  };
}

/**
 * Records every shadow-worthy signal from a batch of scan results, once a
 * session. The scheduled scans and the 15-minute full-universe scan re-find
 * the same plan many times a day, so the call is the plan on its session: one
 * row per version, symbol, side, entry, stop and session (migration 0112's
 * unique index, the upsert's conflict target, which also settles two runs
 * inserting at once). A plan whose trade is on (filled and still held) is not
 * recorded again on a later session either: it is the same trade (MU's
 * 900.05/1003 short was counted four times on 2026-10-12). Best-effort: a write failure is logged
 * and swallowed, matching this codebase's posture for telemetry that must not
 * fail the scan it rides along with (see `persistCoarseTelemetry`).
 */
export async function recordShadowSignals(
  supabase: SupabaseClient,
  results: ScanResult[],
  source: string,
  now: Date = new Date(),
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
      session_date: r.sessionDate,
    }));

  if (rows.length === 0) return { recorded: 0 };

  // A plan whose trade is on (filled and still held) is the same trade, not a
  // new call, whatever session re-finds it. A plan from an earlier session
  // that never filled lasted its session (Q17), so the next session's is a new
  // call. An earlier row whose session has ended but that no pass has read yet
  // (the 15-minute scan records after the close, when no evaluation pass
  // runs) is walked here first, at most `MAX_WALKS_ON_RECORD` a run; one that
  // can't be read is taken as the same trade, so a fill is never counted
  // twice. Best effort: if the read fails, the unique index still holds a
  // session to one row.
  type OpenRow = PendingShadowRow & { session_date: string | null; checked_at: string | null };
  const open = new Map<string, OpenRow[]>();
  const key = (r: { symbol: string; direction: string; entry: number; stop_loss: number }) =>
    `${r.symbol}|${r.direction}|${Number(r.entry)}|${Number(r.stop_loss)}`;
  try {
    const { data } = await supabase
      .from("shadow_signals")
      .select("id, symbol, direction, entry, stop_loss, scanned_at, session_date, fill_price, checked_at")
      .eq("strategy_version", STRATEGY_VERSION)
      .is("outcome", null)
      .in("symbol", [...new Set(rows.map((r) => r.symbol))]);
    for (const r of (data ?? []) as OpenRow[]) open.set(key(r), [...(open.get(key(r)) ?? []), r]);
  } catch {
    // Read failed or unsupported: fall through and rely on the unique index.
  }

  const unread = (r: { session_date: string }, e: OpenRow) =>
    e.fill_price == null &&
    e.session_date != null &&
    e.session_date < r.session_date &&
    shadowSessionComplete(e.session_date, e.symbol, now);
  const toWalk = new Map<string, OpenRow>();
  for (const r of rows) for (const e of open.get(key(r)) ?? []) if (unread(r, e)) toWalk.set(e.id, e);
  // Least recently checked first, so a row that keeps failing doesn't take
  // the same slot every run (the walk stamps `checked_at`).
  const walkable = [...toWalk.values()]
    .sort((a, b) => (a.checked_at ?? "").localeCompare(b.checked_at ?? ""))
    .slice(0, MAX_WALKS_ON_RECORD);
  let walked = new Map<string, ShadowOutcome | null>();
  if (walkable.length > 0) {
    // Bounded: a slow provider holds these plans back (as unread) rather
    // than eat the scan's fan-out time.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), WALK_ON_RECORD_TIMEOUT_MS);
    });
    const startedAt = Date.now();
    walked = (await Promise.race([walkShadowRows(supabase, walkable, now), timeout])) ?? new Map();
    clearTimeout(timer);
    console.log(`shadow: walked ${walkable.length} earlier row(s) before recording in ${Date.now() - startedAt}ms`);
  }

  const sameTrade = (r: { session_date: string }, e: OpenRow) => {
    if (unread(r, e)) {
      if (!walked.has(e.id)) return true; // over the cap: not read, so held back
      const result = walked.get(e.id);
      if (result == null) return true; // couldn't be read
      return result.outcome === "pending" && (result.filled === true || result.fillPrice != null);
    }
    return e.fill_price != null || e.session_date == null || e.session_date >= r.session_date;
  };
  const seen = new Set<string>();
  const fresh = rows.filter((r) => {
    const k = `${key(r)}|${r.session_date}`;
    if ((open.get(key(r)) ?? []).some((e) => sameTrade(r, e)) || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (fresh.length === 0) return { recorded: 0 };

  // Only the rows actually inserted come back: a repeat the index set aside
  // is not counted.
  const { data: inserted, error } = await supabase
    .from("shadow_signals")
    .upsert(fresh, {
      onConflict: "strategy_version,symbol,direction,entry,stop_loss,session_date",
      ignoreDuplicates: true,
    })
    .select("id");
  if (error) {
    console.error(`shadow: signal recording failed — ${error.message}`);
    return { recorded: 0 };
  }
  return { recorded: (inserted ?? []).length };
}

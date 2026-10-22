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
import { isCryptoSymbol } from "@/lib/market/cryptoSymbol";
import { etDateKey, etParts } from "@/lib/market/session";
import { isEarlyClose, isTradingDay } from "@/lib/market/calendar";

/** 4:00 PM and an early close's 1:00 PM, New York time, in minutes since midnight. */
const CLOSE_MINUTES = 16 * 60;
const EARLY_CLOSE_MINUTES = 13 * 60;

/**
 * The New York session a signal trades. Gann chose his active stocks from the
 * completed daily charts the night before and timed them in the next session
 * (Master Course Ch. 13; AGENTS.md, "This covers how the platform runs"), and
 * a plan lasts its session (Q17). So a signal recorded before the
 * close trades that day's session (a pre-market scan included), and one
 * recorded after the close, on a weekend or on a market holiday trades the
 * next trading session. Crypto never closes: it trades the New York day it was
 * recorded in, from the scan on.
 */
export function shadowTradeSession(scannedAt: string, symbol: string): string {
  const at = new Date(scannedAt);
  const today = etDateKey(at);
  if (isCryptoSymbol(symbol)) return today;
  const close = isEarlyClose(today) ? EARLY_CLOSE_MINUTES : CLOSE_MINUTES;
  if (isTradingDay(at) && etParts(at).minutes < close) return today;
  // Noon UTC is the same New York date whatever the season.
  const cursor = new Date(`${today}T12:00:00Z`);
  for (let i = 0; i < 10; i++) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (isTradingDay(cursor)) return etDateKey(cursor);
  }
  return etDateKey(cursor);
}

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
 * Whether the session a signal trades is over: an earlier New York day, or
 * today once a US equity's session has closed (1:00 PM on an early close, and
 * all day on a weekend or holiday). Crypto's day is over only when the New
 * York day is.
 */
export function shadowSessionComplete(sessionDate: string, symbol: string, now: Date): boolean {
  const today = etDateKey(now);
  if (sessionDate !== today) return sessionDate < today;
  if (isCryptoSymbol(symbol)) return false;
  const close = isEarlyClose(today) ? EARLY_CLOSE_MINUTES : CLOSE_MINUTES;
  return !isTradingDay(now) || etParts(now).minutes >= close;
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
  // call. An earlier row not yet read since its session ended can't be told
  // apart; it is read before the scheduled scans record (scheduled-scan.ts),
  // so only the 15-minute scan can meet one, and it records the new call.
  // Best effort: if the read fails, the unique index still holds a session to
  // one row.
  type OpenRow = { symbol: string; direction: string; entry: number; stop_loss: number; session_date: string | null; fill_price: number | null };
  const open = new Map<string, OpenRow[]>();
  const key = (r: { symbol: string; direction: string; entry: number; stop_loss: number }) =>
    `${r.symbol}|${r.direction}|${Number(r.entry)}|${Number(r.stop_loss)}`;
  try {
    const { data } = await supabase
      .from("shadow_signals")
      .select("symbol, direction, entry, stop_loss, session_date, fill_price")
      .eq("strategy_version", STRATEGY_VERSION)
      .is("outcome", null)
      .in("symbol", [...new Set(rows.map((r) => r.symbol))]);
    for (const r of (data ?? []) as OpenRow[]) open.set(key(r), [...(open.get(key(r)) ?? []), r]);
  } catch {
    // Read failed or unsupported: fall through and rely on the unique index.
  }
  const sameTrade = (r: { session_date: string }, earlier: OpenRow) =>
    earlier.fill_price != null || earlier.session_date == null || earlier.session_date >= r.session_date;
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

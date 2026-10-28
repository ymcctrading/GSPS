/**
 * GSPS — the evaluation ledger's writers and reader (migration 0129; owner,
 * 2026-10-28, "I approve all 5" on the October 27 coverage report).
 *
 * One row per session and symbol, holding the first time each stage was
 * reached: the market scan's pre-filter and shortlist, its discovery of a
 * newly active stock, the intraday queue's slot or deferral, and the first
 * system detection with its three times kept apart (the bar read, when its
 * delayed data could first be seen, when the scan evaluated it). The database
 * keeps the first value and skips a write that would set nothing new, so a
 * writer may send the same stage every scan.
 *
 * Hindsight data, service role only. The only live reader is the intraday
 * scan, which takes the session's current discoveries as queue candidates.
 * That decides which stocks are examined; it never sets a score, plan or
 * order, and any alert a slot produces is held to that alert's own rules.
 *
 * Best-effort: a failed write is logged and never fails a scan. On by default;
 * `GSPS_EVALUATION_LEDGER=0` turns every write and read off (kill switch).
 *
 * Mandate: 1. Gann kept a record of every trade and read it back (*Tunnel
 * Thru the Air* pp.198-199); this is the platform's record of what it
 * examined. 2. No periodicity claim. 3. Cause and Effect: each stage the cause
 * of the next, recorded once. Law of Creation: scan ⊗ record; the record is
 * what lets a miss be explained rather than guessed.
 */

import type { CoarseTelemetryRow } from "@/lib/scan/telemetry";
import type { DiscoveryReading } from "@/lib/scanner/discovery";
import type { QueuePlan } from "@/lib/scanner/queue";
import { STRATEGY_VERSION } from "@/lib/backtest/strategyVersion";
import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";

export interface LedgerRow {
  session_date: string;
  symbol: string;
  first_prefilter_at?: string;
  first_shortlist_at?: string;
  first_full_score?: number;
  first_full_state?: string;
  first_discovery_at?: string;
  discovery_rank?: number;
  discovery_kinds?: string[];
  discovery_data_as_of?: string;
  first_queued_at?: string;
  queue_tier?: string;
  first_detect_kind?: string;
  first_detect_side?: string;
  first_detect_bar_open?: string;
  first_detect_usable_at?: string;
  first_detect_eval_at?: string;
  strategy_version?: string;
}

/** The ledger's writes are on unless switched off. */
export function ledgerEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.GSPS_EVALUATION_LEDGER !== "0";
}

const BATCH = 300;

/** Pre-filter and shortlist stages from the market scan's coarse rows. Only stocks that reached one. */
export function prefilterRows(rows: readonly CoarseTelemetryRow[], at: Date): LedgerRow[] {
  const iso = at.toISOString();
  const out: LedgerRow[] = [];
  for (const r of rows) {
    const cleared = r.cleared_reversion || r.cleared_continuation;
    if (!cleared && !r.shortlisted && r.full_scan_score == null) continue;
    const row: LedgerRow = { session_date: r.scan_date, symbol: r.symbol, strategy_version: STRATEGY_VERSION };
    if (cleared) row.first_prefilter_at = iso;
    if (r.shortlisted || r.full_scan_score != null) {
      row.first_shortlist_at = iso;
      if (r.full_scan_score != null && Number.isFinite(r.full_scan_score)) row.first_full_score = Math.round(r.full_scan_score * 10) / 10;
      if (r.full_scan_output_state) row.first_full_state = r.full_scan_output_state;
    }
    out.push(row);
  }
  return out;
}

/** Discovery stage, in the discoveries' rank order. */
export function discoveryRows(readings: readonly DiscoveryReading[], sessionDate: string): LedgerRow[] {
  return readings.map((d, i) => ({
    session_date: sessionDate,
    symbol: d.symbol,
    first_discovery_at: d.evaluatedAt,
    discovery_rank: Math.min(i + 1, 32767),
    discovery_kinds: Array.from(new Set(d.conditions.map((c) => c.kind))),
    discovery_data_as_of: d.dataAsOf,
    strategy_version: STRATEGY_VERSION,
  }));
}

/** Queue stage: every selected name with the tier its slot came from. */
export function queueRows(plan: QueuePlan, sessionDate: string, at: Date): LedgerRow[] {
  const iso = at.toISOString();
  return plan.selected.map((e) => ({ session_date: sessionDate, symbol: e.symbol, first_queued_at: iso, queue_tier: e.tier === "rotating" ? `rotating:${e.sourceTier}` : e.tier }));
}

export interface DetectionInput {
  symbol: string;
  /** The New York session the detection's bar belongs to. */
  sessionDate: string;
  kind: string;
  side: "bullish" | "bearish";
  evaluatedAt: string;
  barOpen: string | null;
  usableAt: string | null;
}

/**
 * First detection per session and symbol (the earliest evaluated wins in a
 * batch). Filed under the session of the bar read, not the clock's day, so a
 * holiday's reading of the prior session's bars lands on that session.
 */
export function detectionRows(detections: readonly DetectionInput[]): LedgerRow[] {
  const byKey = new Map<string, DetectionInput>();
  for (const d of [...detections].sort((a, b) => a.evaluatedAt.localeCompare(b.evaluatedAt))) {
    const key = `${d.sessionDate}|${d.symbol.toUpperCase()}`;
    if (!byKey.has(key)) byKey.set(key, d);
  }
  return [...byKey.values()].map((d) => {
    const row: LedgerRow = { session_date: d.sessionDate, symbol: d.symbol.toUpperCase(), first_detect_kind: d.kind, first_detect_side: d.side, first_detect_eval_at: d.evaluatedAt };
    if (d.barOpen) row.first_detect_bar_open = d.barOpen;
    if (d.usableAt) row.first_detect_usable_at = d.usableAt;
    return row;
  });
}

/** Anything with an `rpc` the service client exposes. */
export interface LedgerClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ error: { message: string } | null }>;
}

/**
 * One row per session and symbol: a batch may not touch a row twice (Postgres
 * refuses an upsert that would), so stages for the same stock are merged, the
 * first value given for each field kept. Sorted by key, so every writer locks
 * rows in the same order and two concurrent batches can't deadlock.
 */
export function mergeLedgerRows(rows: readonly LedgerRow[]): LedgerRow[] {
  const byKey = new Map<string, LedgerRow>();
  for (const r of rows) {
    const symbol = r.symbol.trim().toUpperCase();
    if (!symbol || !r.session_date) continue;
    const key = `${r.session_date}|${symbol}`;
    const seen = byKey.get(key);
    if (!seen) {
      byKey.set(key, { ...r, symbol });
      continue;
    }
    for (const [k, v] of Object.entries(r) as [keyof LedgerRow, unknown][]) {
      if (v !== undefined && seen[k] === undefined) (seen as unknown as Record<string, unknown>)[k] = v;
    }
  }
  return [...byKey.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, row]) => row);
}

/**
 * Run a ledger write after the response is sent (Next's `after`), so no scan
 * waits on it, and log how long it took. Outside a request (tests, scripts)
 * it starts the write without waiting.
 */
export function afterResponse(label: string, work: () => Promise<unknown>): void {
  if (!ledgerEnabled()) return;
  const run = async () => {
    const t0 = Date.now();
    try {
      await work();
    } catch (err) {
      console.warn(`[evaluation-ledger] ${label} not written — ${String(err)}`);
    }
    console.info(`[evaluation-ledger] ${label} ${Date.now() - t0}ms (after the response)`);
  };
  try {
    after(run);
  } catch {
    void run();
  }
}

/** Write rows in batches. Never throws; returns how many batches failed. */
export async function writeLedger(client: LedgerClient, input: readonly LedgerRow[], label: string): Promise<number> {
  if (!ledgerEnabled() || input.length === 0) return 0;
  const rows = mergeLedgerRows(input);
  let failed = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    try {
      const { error } = await client.rpc("ledger_touch", { p_rows: rows.slice(i, i + BATCH) });
      if (error) {
        failed += 1;
        console.warn(`[evaluation-ledger] ${label} batch not written — ${error.message}`);
      }
    } catch (err) {
      failed += 1;
      console.warn(`[evaluation-ledger] ${label} batch not written — ${String(err)}`);
    }
  }
  return failed;
}

/**
 * How recent a discovery must be to count as current (engineering, labelled):
 * the last two 15-minute market scans and a little slack. A stock whose
 * condition lapsed drops out once the scans stop reporting it.
 */
export const DISCOVERY_CURRENT_MS = 35 * 60_000;

/**
 * The session's current discoveries for the intraday queue: those the market
 * scan reported within `DISCOVERY_CURRENT_MS`, the latest first (then their
 * latest rank). Read failures return none: the queue simply has no discovery
 * tier that scan.
 */
export async function readSessionDiscoveries(client: SupabaseClient, sessionDate: string, limit: number, now: Date = new Date()): Promise<string[]> {
  if (!ledgerEnabled() || limit <= 0) return [];
  try {
    const q = client
      .from("evaluation_ledger")
      .select("symbol")
      .eq("session_date", sessionDate)
      .gte("last_discovery_at", new Date(now.getTime() - DISCOVERY_CURRENT_MS).toISOString())
      .order("last_discovery_at", { ascending: false })
      .order("discovery_rank", { ascending: true })
      .limit(limit);
    const { data, error } = await q;
    if (error || !Array.isArray(data)) return [];
    return data.map((r: { symbol: unknown }) => String(r.symbol).toUpperCase());
  } catch {
    return [];
  }
}

/**
 * Count one deferral for each name the queue left out, once per rotation tick
 * (`tickStart`, the tick's first instant): a second scan in the same tick
 * counts nothing. The caller writes these in the regular session only. Never
 * throws.
 */
export async function writeDeferred(client: LedgerClient, sessionDate: string, symbols: readonly string[], tickStart: Date): Promise<void> {
  if (!ledgerEnabled() || symbols.length === 0) return;
  try {
    const { error } = await client.rpc("ledger_deferred", { p_session: sessionDate, p_symbols: [...symbols], p_tick: tickStart.toISOString() });
    if (error) console.warn(`[evaluation-ledger] deferrals not written — ${error.message}`);
  } catch (err) {
    console.warn(`[evaluation-ledger] deferrals not written — ${String(err)}`);
  }
}

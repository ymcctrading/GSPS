/**
 * Turning a market scan into the rows the dashboard reads, and saving them.
 *
 * Two rules the previous write path broke, both of which left the dashboard
 * showing a stale day with no explanation:
 *
 * 1. A published row is a trade plan. Migration `0006` makes the four price
 *    columns NOT NULL, so one planless result in the batch makes Postgres
 *    reject all thirty rows — not just that one.
 * 2. The day is never cleared until its replacement is safely stored. The old
 *    path deleted the day first and inserted second, so a rejected insert
 *    emptied the lists instead of leaving the previous run in place.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { hasTradePlan } from "@/lib/marketScan";
import type { ScanResult } from "@/lib/types";

export type Direction = "bullish" | "bearish";

const DIRECTIONS: Direction[] = ["bullish", "bearish"];

export interface DailyScanRow {
  scan_date: string;
  direction: Direction;
  rank: number;
  symbol: string;
  score: number;
  output_state: string;
  entry: number;
  stop_loss: number;
  take_profit_1: number;
  master_profit: number;
  detail: Record<string, unknown>;
}

/**
 * A Postgres error arriving through PostgREST is a plain object, not an
 * `Error`, so `String(err)` renders it "[object Object]" — which is what the
 * refresh button reported for two days while a NOT NULL violation went unread.
 * Everything the driver knows about the failure is kept, in the order an
 * operator needs it.
 */
export function describeDbError(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;

  if (err !== null && typeof err === "object") {
    const e = err as { message?: string; details?: string; hint?: string; code?: string };
    const text = [e.message, e.details, e.hint].filter(Boolean).join(" — ");
    if (text) return e.code ? `${text} [${e.code}]` : text;
    try {
      return JSON.stringify(err);
    } catch {
      /* circular or otherwise unserialisable — fall through to String() */
    }
  }

  return String(err);
}

/**
 * Last line of defence before the table: nothing without a full trade plan is
 * published, whatever ranking upstream decided. Ranks are assigned after the
 * filter so the stored list stays 1..n with no gaps.
 */
export function buildScanRows(
  scanDate: string,
  direction: Direction,
  results: ScanResult[],
): DailyScanRow[] {
  return results.filter(hasTradePlan).map((r, i) => ({
    scan_date: scanDate,
    direction,
    rank: i + 1,
    symbol: r.symbol,
    score: r.decision.score,
    output_state: r.decision.outputState,
    // hasTradePlan has already established these four are finite numbers.
    entry: r.levels!.entry,
    stop_loss: r.levels!.stopLoss,
    take_profit_1: r.levels!.takeProfit1,
    master_profit: r.levels!.masterProfit,
    detail: {
      currentPrice: r.currentPrice,
      pattern: r.pattern,
      armedPatterns: r.armedPatterns,
      gann: r.gann,
      breakdown: r.decision.breakdown,
      trends: r.trends.map((t) => ({ timeframe: t.timeframe, direction: t.direction })),
    },
  }));
}

export interface PersistOutcome {
  persisted: boolean;
  /** Rows now published for the day. */
  count: number;
  /** Why nothing was saved. Null on success. */
  error: string | null;
}

/**
 * Publish a day's rows, upserting over the unique (scan_date, direction, rank)
 * key so the previous run stays readable until the replacement lands. Rows
 * beyond the new list — a shorter day than the last one — are pruned after the
 * upsert succeeds.
 */
export async function persistDailyScans(
  client: SupabaseClient,
  scanDate: string,
  rows: DailyScanRow[],
): Promise<PersistOutcome> {
  if (rows.length === 0) {
    // Not a failure to save: there was nothing worth saving. Wiping the day
    // over it would trade a stale list for an empty one.
    return {
      persisted: false,
      count: 0,
      error: "no setup cleared the protocol with a complete trade plan",
    };
  }

  const { error } = await client
    .from("daily_scans")
    .upsert(rows, { onConflict: "scan_date,direction,rank" });
  if (error) {
    return { persisted: false, count: 0, error: describeDbError(error) };
  }

  // A shorter list than the run it replaces leaves higher ranks behind. The new
  // rows are already live, so a failure here is a stale tail, not a failed save.
  for (const direction of DIRECTIONS) {
    const written = rows.filter((r) => r.direction === direction).length;
    const { error: pruneError } = await client
      .from("daily_scans")
      .delete()
      .eq("scan_date", scanDate)
      .eq("direction", direction)
      .gt("rank", written);
    if (pruneError) {
      console.warn(
        `daily_scans: ${direction} rows above rank ${written} on ${scanDate} were not cleared — ${describeDbError(pruneError)}`,
      );
    }
  }

  return { persisted: true, count: rows.length, error: null };
}

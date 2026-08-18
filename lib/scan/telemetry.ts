/**
 * Diagnostic log for the market scan's coarse pre-filter (see
 * `lib/marketScan.ts`) — one row per symbol per scan day, recording the raw
 * ATR-relative measurements the coarse gate judged and whether the symbol
 * went on to a real full-protocol score. Exists so the ATR-multiple
 * thresholds the gate was rebased to (`EXTENSION_ATR_TIER1`/`TIER2`,
 * `TRAVEL_ATR_MULT` in `lib/marketScan.ts`) — chosen by preserving the ratio
 * the old flat-percent thresholds expressed, not by measuring real outcomes
 * — can be calibrated against actual data once enough scan days accumulate,
 * instead of staying a one-time guess.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { describeDbError } from "./publish";

export interface CoarseTelemetryRow {
  scan_date: string;
  symbol: string;
  /** The underlying daily trend read, not either gate's candidate direction. */
  direction: "bullish" | "bearish" | null;
  price: number;
  atr_pct: number | null;
  extension_pct: number;
  extension_atr: number | null;
  cleared_reversion: boolean;
  reversion_score: number | null;
  cleared_continuation: boolean;
  continuation_score: number | null;
  travel_pct: number | null;
  travel_atr: number | null;
  /** Whether this symbol's reversion score made the top-`perSide*4` shortlist. */
  shortlisted: boolean;
  /** The real protocol score, when this symbol got a full scan (shortlisted or a continuation top-up candidate). Null otherwise — the coarse gate never let it through. */
  full_scan_score: number | null;
  full_scan_output_state: string | null;
}

/**
 * Best-effort — a write failure here is a lost calibration data point, never
 * a reason to fail or slow down the scan that produced it.
 */
export async function persistCoarseTelemetry(
  client: SupabaseClient,
  rows: CoarseTelemetryRow[],
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await client
    .from("coarse_gate_telemetry")
    .upsert(rows, { onConflict: "scan_date,symbol" });
  if (error) {
    console.warn(`coarse_gate_telemetry: ${rows.length} rows not saved — ${describeDbError(error)}`);
  }
}

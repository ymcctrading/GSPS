/**
 * A symbol scanned on its own (single-ticker, on-demand, morning scan —
 * anything `active_monitors` tracks; see app/api/scan-history/route.ts's
 * header for the sourced list) can read EXECUTE right now without ever
 * appearing on the Home dashboard: `lib/dailyScans.ts` only shows the
 * market-wide daily_scans table (a fixed top-15/15 universe, refreshed by
 * a once-a-day cron — Vercel Hobby's 2-job cap rules out refreshing it more
 * often), and `/api/batch-scan`'s on-demand path only covers its own
 * hardcoded default watchlist. Neither surface is "wrong"; each covers a
 * different population. This reader closes the actual gap: a user's own
 * live EXECUTE monitors, so a symbol they scanned individually and that now
 * reads Execute is visible from Home, not only from Scan History.
 *
 * Same "never rescan" discipline as scan-history's read: this is a live
 * read of `active_monitors` plus each symbol's most recent `scan_results`
 * row for the trade-plan numbers (entry/stop/TP1/MP/price) — never a fresh
 * scan — so it can disagree with a truly live rescan the way scan-history's
 * "now" already can, but never with a second code path computing its own
 * verdict.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ScanRow } from "@/components/scan/results-table";

export async function getTrackedExecuteSetups(
  supabase: SupabaseClient,
  profileId: string,
): Promise<ScanRow[]> {
  const { data: monitors } = await supabase
    .from("active_monitors")
    .select("symbol")
    .eq("profile_id", profileId)
    .eq("state", "EXECUTE");

  const symbols = [...new Set((monitors ?? []).map((m) => m.symbol as string))];
  if (symbols.length === 0) return [];

  interface LatestScanResultRow {
    symbol: string;
    direction: string;
    score: number;
    output_state: string;
    entry: number | null;
    stop_loss: number | null;
    take_profit_1: number | null;
    master_profit: number | null;
    created_at: string;
  }

  const { data: resultRows } = await supabase
    .from("scan_results")
    .select(
      "symbol, direction, score, output_state, entry, stop_loss, take_profit_1, master_profit, created_at",
    )
    .eq("user_id", profileId)
    .in("symbol", symbols)
    .order("created_at", { ascending: false });

  // First (most recent) row per symbol wins.
  const latestBySymbol = new Map<string, LatestScanResultRow>();
  for (const row of (resultRows ?? []) as LatestScanResultRow[]) {
    if (!latestBySymbol.has(row.symbol)) latestBySymbol.set(row.symbol, row);
  }

  return symbols
    .map((symbol) => latestBySymbol.get(symbol))
    .filter((row): row is NonNullable<typeof row> => row != null)
    .map((row) => ({
      symbol: row.symbol,
      score: row.score,
      outputState: row.output_state,
      direction: row.direction,
      entry: row.entry,
      stopLoss: row.stop_loss,
      takeProfit1: row.take_profit_1,
      masterProfit: row.master_profit,
    }))
    .sort((a, b) => b.score - a.score);
}

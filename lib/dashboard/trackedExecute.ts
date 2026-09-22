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
 * Trade-plan numbers (entry/stop/TP1/master) now come straight off the
 * `active_monitors` row itself (migration 0071) — every caller that can
 * produce an EXECUTE monitor (`lib/entitlements/scan-fanout.ts`, used by
 * both the single-ticker route and the scheduled/batch scans) writes them
 * there. This used to join each symbol's most recent `scan_results` row
 * instead, but `scan_results` is written by exactly one caller
 * (`app/api/batch-scan/route.ts`) — a monitor born from a single-ticker or
 * scheduled scan had no matching row and was silently dropped from this
 * list (`.filter((row) => row != null)`), the exact "built once and left
 * stranded" shape AGENTS.md's cross-platform consistency principle warns
 * about. A `scan_results` fallback is kept only for a monitor row written
 * before this migration, whose new columns are still null.
 *
 * Same "never rescan" discipline as scan-history's read: this is a live
 * read of `active_monitors`, never a fresh scan — so it can disagree with a
 * truly live rescan the way scan-history's "now" already can, but never
 * with a second code path computing its own verdict.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ScanRow } from "@/components/scan/results-table";

interface OpenExecuteMonitor {
  symbol: string;
  score: number | null;
  output_state: string | null;
  direction: string | null;
  entry: number | null;
  stop_loss: number | null;
  take_profit_1: number | null;
  master_profit: number | null;
  pattern_name: string | null;
}

export async function getTrackedExecuteSetups(
  supabase: SupabaseClient,
  profileId: string,
): Promise<ScanRow[]> {
  const { data: monitors } = await supabase
    .from("active_monitors")
    .select("symbol, score, output_state, direction, entry, stop_loss, take_profit_1, master_profit, pattern_name")
    .eq("profile_id", profileId)
    .eq("state", "EXECUTE");

  const rows = (monitors ?? []) as OpenExecuteMonitor[];
  if (rows.length === 0) return [];

  // Rows carrying every new-schema field can be served without the
  // scan_results fallback at all.
  const needsFallback = rows.filter((r) => r.direction == null || r.entry == null);
  const fallbackBySymbol = await loadScanResultsFallback(
    supabase,
    profileId,
    needsFallback.map((r) => r.symbol),
  );

  return rows
    .map((row) => {
      const fallback = fallbackBySymbol.get(row.symbol) ?? null;
      const direction = row.direction ?? fallback?.direction ?? null;
      const entry = row.entry ?? fallback?.entry ?? null;
      if (direction == null || entry == null) return null;
      return {
        symbol: row.symbol,
        score: row.score ?? fallback?.score ?? 0,
        outputState: row.output_state ?? fallback?.output_state ?? "Watch",
        direction,
        entry,
        stopLoss: row.stop_loss ?? fallback?.stop_loss ?? null,
        takeProfit1: row.take_profit_1 ?? fallback?.take_profit_1 ?? null,
        masterProfit: row.master_profit ?? fallback?.master_profit ?? null,
        patternName: row.pattern_name ?? null,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row != null)
    .sort((a, b) => b.score - a.score);
}

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

/** Only for monitor rows predating migration 0071's trade-plan columns. */
async function loadScanResultsFallback(
  supabase: SupabaseClient,
  profileId: string,
  symbols: string[],
): Promise<Map<string, LatestScanResultRow>> {
  const fallbackBySymbol = new Map<string, LatestScanResultRow>();
  if (symbols.length === 0) return fallbackBySymbol;

  const { data: resultRows } = await supabase
    .from("scan_results")
    .select(
      "symbol, direction, score, output_state, entry, stop_loss, take_profit_1, master_profit, created_at",
    )
    .eq("user_id", profileId)
    .in("symbol", symbols)
    .order("created_at", { ascending: false });

  // First (most recent) row per symbol wins.
  for (const row of (resultRows ?? []) as LatestScanResultRow[]) {
    if (!fallbackBySymbol.has(row.symbol)) fallbackBySymbol.set(row.symbol, row);
  }
  return fallbackBySymbol;
}

/**
 * Shared reader for the market-wide daily scan (15 bullish + 15 bearish).
 * Used by the dashboard preview and the full per-direction lists.
 */

import { createClient } from "@/lib/supabase/server";
import type { ScanRow } from "@/components/scan/results-table";

export type Direction = "bullish" | "bearish";

interface DailyScanRow {
  symbol: string;
  direction: Direction;
  rank: number;
  score: number;
  output_state: string;
  entry: number | null;
  stop_loss: number | null;
  take_profit_1: number | null;
  master_profit: number | null;
  scan_date: string;
  detail: {
    pattern?: { name?: string } | null;
    setupKind?: string | null;
  } | null;
}

/**
 * A published row must carry the whole trade plan. The scan pipeline now
 * guarantees it, but rows written before that are still in the table and would
 * otherwise keep rendering as scored setups with four empty price columns —
 * so the reader drops them too, rather than waiting for the next daily run.
 */
function isComplete(r: DailyScanRow): boolean {
  return [r.entry, r.stop_loss, r.take_profit_1, r.master_profit].every(
    // Coerced rather than typeof-checked: a driver that hands back `numeric`
    // as a string must not empty the whole dashboard.
    (v) => v !== null && v !== undefined && Number.isFinite(Number(v)),
  );
}

function toRow(r: DailyScanRow): ScanRow {
  return {
    symbol: r.symbol,
    score: r.score,
    outputState: r.output_state,
    direction: r.direction,
    entry: r.entry,
    stopLoss: r.stop_loss,
    takeProfit1: r.take_profit_1,
    masterProfit: r.master_profit,
    patternName: r.detail?.pattern?.name ?? null,
    // Rows written before continuations existed carry no kind; they were all
    // reversions, which is also what the column defaults to reading as.
    setupKind: r.detail?.setupKind === "continuation" ? "continuation" : "reversion",
  };
}

export interface DailyScans {
  configured: boolean;
  scanDate: string | null;
  bullish: ScanRow[];
  bearish: ScanRow[];
}

export async function getDailyScans(): Promise<DailyScans> {
  const configured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  if (!configured) return { configured: false, scanDate: null, bullish: [], bearish: [] };

  const supabase = await createClient();
  const { data: latest } = await supabase
    .from("daily_scans")
    .select("scan_date")
    .order("scan_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const scanDate = latest?.scan_date ?? null;
  if (!scanDate) return { configured: true, scanDate: null, bullish: [], bearish: [] };

  const { data } = await supabase
    .from("daily_scans")
    .select("*")
    .eq("scan_date", scanDate)
    .order("rank");
  const rows = ((data ?? []) as DailyScanRow[]).filter(isComplete);

  return {
    configured: true,
    scanDate,
    bullish: rows.filter((r) => r.direction === "bullish").map(toRow),
    bearish: rows.filter((r) => r.direction === "bearish").map(toRow),
  };
}

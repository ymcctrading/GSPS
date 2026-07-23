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
  detail: { pattern?: { name?: string } | null } | null;
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
  const rows = (data ?? []) as DailyScanRow[];

  return {
    configured: true,
    scanDate,
    bullish: rows.filter((r) => r.direction === "bullish").map(toRow),
    bearish: rows.filter((r) => r.direction === "bearish").map(toRow),
  };
}

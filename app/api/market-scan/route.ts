/**
 * GSPS — /api/market-scan
 * Runs the daily market-wide reversion scan (15 bullish + 15 bearish) and
 * persists results to Supabase. Invoked by Vercel Cron (Authorization:
 * Bearer CRON_SECRET) or manually with the same header.
 */

import { NextRequest, NextResponse } from "next/server";
import { runMarketScan } from "@/lib/marketScan";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { ScanResult } from "@/lib/types";

export const maxDuration = 300;

function toRows(scanDate: string, direction: "bullish" | "bearish", results: ScanResult[]) {
  return results.map((r, i) => ({
    scan_date: scanDate,
    direction,
    rank: i + 1,
    symbol: r.symbol,
    score: r.decision.score,
    output_state: r.decision.outputState,
    entry: r.levels?.entry ?? null,
    stop_loss: r.levels?.stopLoss ?? null,
    take_profit_1: r.levels?.takeProfit1 ?? null,
    master_profit: r.levels?.masterProfit ?? null,
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

async function runAndPersist() {
  const output = await runMarketScan();

  // Persist (best-effort — the scan output is returned either way)
  let persisted = false;
  let persistError: string | null = null;
  try {
    const supabase = createServiceClient();
    const rows = [
      ...toRows(output.scanDate, "bullish", output.bullish),
      ...toRows(output.scanDate, "bearish", output.bearish),
    ];
    await supabase.from("daily_scans").delete().eq("scan_date", output.scanDate);
    const { error } = await supabase.from("daily_scans").insert(rows);
    if (error) throw error;
    persisted = true;
  } catch (err) {
    persistError = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json({
    scanDate: output.scanDate,
    universeSize: output.universeSize,
    shortlisted: output.shortlisted,
    bullish: output.bullish.map((r) => ({ symbol: r.symbol, score: r.decision.score, state: r.decision.outputState })),
    bearish: output.bearish.map((r) => ({ symbol: r.symbol, score: r.decision.score, state: r.decision.outputState })),
    persisted,
    persistError,
  });
}

/** Cron entry point — authorized with the shared CRON_SECRET. */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runAndPersist();
}

/** Manual refresh — any signed-in user can rebuild the market scan on demand. */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  return runAndPersist();
}

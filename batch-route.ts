/**
 * GSPS v2.0 — /api/batch-scan route (Next.js App Router)
 * -------------------------------------------------------
 * Usage:
 *   GET /api/batch-scan
 *     -> runs the default "Batch 1" watchlist
 *
 *   GET /api/batch-scan?tickers=SPY,AAPL,TSLA
 *     -> runs your own custom list
 */

import { NextRequest, NextResponse } from "next/server";
import { scanTicker } from "@/lib/scanTicker";
import { resolveMarketDataProvider } from "@/lib/providers";

const DEFAULT_WATCHLIST = [
  "SPY", "AAPL", "AMD", "TSLA", "MSFT", "META",
  "NVDA", "AMZN", "GOOGL", "TTWO",
];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const tickersParam = searchParams.get("tickers");
  const tickers = tickersParam
    ? tickersParam.split(",").map((t) => t.trim()).filter(Boolean)
    : DEFAULT_WATCHLIST;

  // Live Alpaca feed when ALPACA_API_KEY_ID/SECRET are set, else simulated.
  const provider = resolveMarketDataProvider();

  // Run all scans in parallel so a 10-stock batch takes roughly as
  // long as a single scan, not 10x as long.
  const results = await Promise.all(
    tickers.map((ticker) => scanTicker(ticker, undefined, provider)),
  );

  const execute = results.filter((r) => r.decision.outputState === "Execute");
  const watch = results.filter((r) => r.decision.outputState === "Watch");
  const reject = results.filter((r) => r.decision.outputState === "Reject");

  return NextResponse.json({
    requestedAt: new Date().toISOString(),
    totalRequested: tickers.length,
    summary: {
      execute: execute.length,
      watch: watch.length,
      reject: reject.length,
    },
    results,
  });
}

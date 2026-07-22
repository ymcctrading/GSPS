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

// Canonical default scan universe (see review/insights/03-default-asset-list.md):
// SPY (broad-market anchor) + BTC (crypto macro indicator) + the Magnificent 7.
const DEFAULT_WATCHLIST = [
  "SPY",
  "BTC",
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA",
];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const tickersParam = searchParams.get("tickers");
  const tickers = tickersParam
    ? // Normalize a custom list: trim, uppercase, drop blanks, de-duplicate.
      [...new Set(
        tickersParam
          .split(",")
          .map((t) => t.trim().toUpperCase())
          .filter(Boolean),
      )]
    : DEFAULT_WATCHLIST;

  // Run all scans in parallel so a 10-stock batch takes roughly as
  // long as a single scan, not 10x as long.
  const results = await Promise.all(tickers.map((ticker) => scanTicker(ticker)));

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

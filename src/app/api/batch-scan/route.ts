/**
 * GSPS v2.0 — /api/batch-scan
 * ---------------------------
 *   GET /api/batch-scan                      -> default 9-asset universe
 *   GET /api/batch-scan?tickers=SPY,AAPL,TSLA -> custom list
 */
import { NextRequest, NextResponse } from "next/server";
import { scanTicker } from "@/lib/scanTicker";
import { DEFAULT_WATCHLIST } from "@/config/watchlist";

export const dynamic = "force-dynamic";

/** Guardrail: cap a custom batch so one request can't fan out unbounded work. */
const MAX_BATCH = 50;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tickersParam = searchParams.get("tickers");
  const tickers = tickersParam
    ? tickersParam.split(",").map((t) => t.trim()).filter(Boolean)
    : DEFAULT_WATCHLIST;

  if (tickers.length === 0) {
    return NextResponse.json({ error: "No valid tickers provided" }, { status: 400 });
  }
  if (tickers.length > MAX_BATCH) {
    return NextResponse.json(
      { error: `Too many tickers (max ${MAX_BATCH})` },
      { status: 400 }
    );
  }

  try {
    // Run all scans in parallel so a batch takes ~as long as a single scan.
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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

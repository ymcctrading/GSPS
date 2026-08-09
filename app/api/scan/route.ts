/**
 * GSPS v2.0 — /api/scan route (Next.js App Router)
 * -----------------------------------------------------
 * Usage:
 *   GET /api/scan?ticker=AAPL
 *   GET /api/scan?ticker=AAPL&optionPremium=1.85
 */

import { NextRequest, NextResponse } from "next/server";
import { scanTicker } from "@/lib/scanTicker";
import { redactScanResult } from "@/lib/scoring/public-summary";
import { verifyAuth } from "@/lib/auth";
import { recordScanVerdict } from "@/lib/learning/record";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ticker = searchParams.get("ticker");
  const optionPremiumParam = searchParams.get("optionPremium");
  const optionPremium = optionPremiumParam ? Number(optionPremiumParam) : undefined;

  if (!ticker) {
    return NextResponse.json({ error: "Missing required 'ticker' query param" }, { status: 400 });
  }

  const result = await scanTicker(ticker, optionPremium);

  // A verdict is the input the learning tables were built to accumulate, and
  // until now nothing ever wrote one. Recorded for signed-in callers only: the
  // rows are per-user and RLS-scoped, so an anonymous scan has no row to own.
  // Failures are swallowed inside the recorder — a scan that produced an answer
  // must not 500 because telemetry could not be stored.
  const userId = await verifyAuth();
  if (userId) {
    await recordScanVerdict(userId, result, {
      timeframe: "15Min",
      bar: result.executionBar,
    });
  }

  // The per-criterion breakdown is the scoring model; only its rollup ships.
  return NextResponse.json(redactScanResult(result));
}

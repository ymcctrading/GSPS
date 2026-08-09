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

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ticker = searchParams.get("ticker");
  const optionPremiumParam = searchParams.get("optionPremium");
  const optionPremium = optionPremiumParam ? Number(optionPremiumParam) : undefined;

  if (!ticker) {
    return NextResponse.json({ error: "Missing required 'ticker' query param" }, { status: 400 });
  }

  const result = await scanTicker(ticker, optionPremium);
  // The per-criterion breakdown is the scoring model; only its rollup ships.
  return NextResponse.json(redactScanResult(result));
}

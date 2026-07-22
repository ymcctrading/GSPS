/**
 * GSPS v2.0 — /api/scan route (Next.js App Router)
 * -----------------------------------------------------
 * Usage:
 *   GET /api/scan?ticker=AAPL
 *   GET /api/scan?ticker=AAPL&optionPremium=1.85
 */

import { NextRequest, NextResponse } from "next/server";
import { scanTicker } from "@/lib/scanTicker";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ticker = searchParams.get("ticker")?.trim().toUpperCase();
  const optionPremiumParam = searchParams.get("optionPremium");

  if (!ticker) {
    return NextResponse.json({ error: "Missing required 'ticker' query param" }, { status: 400 });
  }

  // Validate optionPremium up front so a bad value fails loudly with a 400
  // instead of silently passing NaN/negative into the scan engine.
  let optionPremium: number | undefined;
  if (optionPremiumParam !== null) {
    const parsed = Number(optionPremiumParam);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return NextResponse.json(
        { error: "'optionPremium' must be a non-negative number" },
        { status: 400 },
      );
    }
    optionPremium = parsed;
  }

  const result = await scanTicker(ticker, optionPremium);
  return NextResponse.json(result);
}

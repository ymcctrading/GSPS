/**
 * GSPS v2.0 — /api/scan
 * ---------------------
 *   GET /api/scan?ticker=AAPL
 *   GET /api/scan?ticker=AAPL&optionPremium=1.85
 */
import { NextRequest, NextResponse } from "next/server";
import { scanTicker } from "@/lib/scanTicker";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ticker = searchParams.get("ticker");
  const optionPremiumParam = searchParams.get("optionPremium");
  const optionPremium = optionPremiumParam ? Number(optionPremiumParam) : undefined;

  if (!ticker) {
    return NextResponse.json(
      { error: "Missing required 'ticker' query param" },
      { status: 400 }
    );
  }
  if (optionPremiumParam != null && Number.isNaN(optionPremium)) {
    return NextResponse.json(
      { error: "'optionPremium' must be a number" },
      { status: 400 }
    );
  }

  try {
    const result = await scanTicker(ticker, optionPremium);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

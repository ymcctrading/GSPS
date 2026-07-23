/**
 * GET /api/quote?ticker=SPY — last price + change for the header/price bar.
 */
import { NextRequest, NextResponse } from "next/server";
import { getMarketDataProvider } from "@/lib/marketData";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ticker = searchParams.get("ticker");
  if (!ticker) {
    return NextResponse.json({ error: "Missing 'ticker'" }, { status: 400 });
  }
  const quote = await getMarketDataProvider().getQuote(ticker);
  return NextResponse.json(quote);
}

/**
 * GSPS — /api/forex?symbols=EUR_USD,GBP_USD,USD_JPY
 * Fetch forex (currency pair) data from Oanda.
 * Requires OANDA_API_KEY environment variable.
 * Server-side only — never exposes API keys to browser.
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchOandaData, fetchOandaMultiple } from "@/lib/data/oanda";
import type { UnifiedMarketData } from "@/lib/data/market-data";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbolsParam = searchParams.get("symbols");

  if (!symbolsParam) {
    return NextResponse.json(
      { error: "Missing 'symbols' parameter (comma-separated, e.g., EUR-USD,GBP-USD)" },
      { status: 400 },
    );
  }

  const symbols = symbolsParam.split(",").map((s) => s.trim()).filter(Boolean);

  if (symbols.length === 0) {
    return NextResponse.json({ error: "No valid symbols provided" }, { status: 400 });
  }

  try {
    let data: UnifiedMarketData[];

    if (symbols.length === 1) {
      data = [await fetchOandaData(symbols[0])];
    } else {
      data = await fetchOandaMultiple(symbols);
    }

    return NextResponse.json({
      data,
      timestamp: new Date().toISOString(),
      source: "oanda",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

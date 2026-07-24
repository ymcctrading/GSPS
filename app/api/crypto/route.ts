/**
 * GSPS — /api/crypto?symbols=BTC,ETH,SOL
 * Fetch cryptocurrency market data from Binance (public endpoint, no API key needed).
 * Server-side only — never exposes API keys to browser.
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchBinanceData, fetchBinanceMultiple } from "@/lib/data/binance";
import type { UnifiedMarketData } from "@/lib/data/market-data";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbolsParam = searchParams.get("symbols");

  if (!symbolsParam) {
    return NextResponse.json({ error: "Missing 'symbols' parameter (comma-separated)" }, { status: 400 });
  }

  const symbols = symbolsParam.split(",").map((s) => s.trim()).filter(Boolean);

  if (symbols.length === 0) {
    return NextResponse.json({ error: "No valid symbols provided" }, { status: 400 });
  }

  try {
    let data: UnifiedMarketData[];

    if (symbols.length === 1) {
      data = [await fetchBinanceData(symbols[0])];
    } else {
      data = await fetchBinanceMultiple(symbols);
    }

    return NextResponse.json({
      data,
      timestamp: new Date().toISOString(),
      source: "binance",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

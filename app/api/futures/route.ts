/**
 * GSPS — /api/futures?symbols=ES,NQ,CL
 * Fetch futures market data from Twelve Data (primary) with Polygon fallback.
 * Requires TWELVE_DATA_API_KEY or POLYGON_API_KEY environment variables.
 * Server-side only — never exposes API keys to browser.
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchFuturesData, fetchTwelveDataMultiple } from "@/lib/data/twelve-data";
import { fetchPolygonStockSnapshot, fetchPolygonMultiple } from "@/lib/data/polygon";
import type { UnifiedMarketData } from "@/lib/data/market-data";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbolsParam = searchParams.get("symbols");
  const provider = searchParams.get("provider") || "twelve_data"; // or 'polygon'

  if (!symbolsParam) {
    return NextResponse.json(
      { error: "Missing 'symbols' parameter (comma-separated, e.g., ES,NQ,CL)" },
      { status: 400 },
    );
  }

  const symbols = symbolsParam.split(",").map((s) => s.trim()).filter(Boolean);

  if (symbols.length === 0) {
    return NextResponse.json({ error: "No valid symbols provided" }, { status: 400 });
  }

  try {
    let data: UnifiedMarketData[];

    if (provider === "polygon") {
      // Use Polygon for stocks/futures
      if (symbols.length === 1) {
        data = [await fetchPolygonStockSnapshot(symbols[0])];
      } else {
        data = await fetchPolygonMultiple(symbols);
      }
    } else {
      // Default to Twelve Data for futures/delayed feeds
      if (symbols.length === 1) {
        data = [await fetchFuturesData(symbols[0])];
      } else {
        data = await fetchTwelveDataMultiple(symbols);
      }
    }

    return NextResponse.json({
      data,
      timestamp: new Date().toISOString(),
      source: provider,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

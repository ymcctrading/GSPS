/**
 * GSPS — /api/options/quote?contract=AAPL261218C00360000
 * One listed contract's real quote, last trade, volume, IV and greeks, for the
 * order ticket's picked contract (`lib/options/liveChain.ts`, the same reading
 * as the chart's options chain, so the two never disagree).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { alpacaConfigured, fetchLatestPrice, optionsFeed } from "@/lib/data/alpaca";
import { fetchLiveOptionContracts } from "@/lib/options/liveChain";
import { parseOccSymbol } from "@/lib/portfolio/occ";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const contract = (new URL(req.url).searchParams.get("contract") ?? "").toUpperCase().trim();
  const parsed = parseOccSymbol(contract);
  if (!parsed) {
    return NextResponse.json({ error: "Missing or invalid 'contract' (OCC symbol)" }, { status: 400 });
  }
  if (!alpacaConfigured()) {
    return NextResponse.json({ error: "Options data is not configured (missing Alpaca API keys)." }, { status: 503 });
  }

  try {
    const spot = await fetchLatestPrice(parsed.underlying, "us_equity");
    const quotes = await fetchLiveOptionContracts([contract], spot);
    const quote = quotes.get(contract) ?? null;
    if (!quote) {
      return NextResponse.json({ error: `No quote for ${contract}` }, { status: 404 });
    }
    return NextResponse.json({ underlyingPrice: spot, feed: optionsFeed(), contract: quote });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}

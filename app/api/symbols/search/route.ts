/**
 * GSPS — /api/symbols/search?q=eli+lilly
 *
 * Ticker-or-company-name lookup for the header search box. A novice should
 * not have to already know "LLY" to find Eli Lilly — this is what lets them
 * type either and get the same result. Backed by Alpaca's tradable-equity
 * list (see `searchAssets` in lib/brokers/alpaca.ts), which is cached
 * in-memory for hours, so this route is cheap even on every keystroke.
 */

import { NextRequest, NextResponse } from "next/server";
import { envCreds, searchAssets } from "@/lib/brokers/alpaca";

export interface SymbolSearchResult {
  symbol: string;
  name: string;
  exchange?: string;
}

export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ results: [] });

  const creds = envCreds("paper");
  if (!creds) return NextResponse.json({ results: [] });

  try {
    const results = await searchAssets(creds, q, 8);
    return NextResponse.json(
      { results },
      { headers: { "Cache-Control": "private, max-age=60" } },
    );
  } catch {
    // Search is a convenience, not a critical path — fail quiet so a
    // hiccuped upstream call doesn't put an error banner in the header.
    return NextResponse.json({ results: [] });
  }
}

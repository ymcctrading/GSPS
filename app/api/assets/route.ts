/**
 * GSPS — /api/assets?symbol=GPUS
 *
 * Tradability pre-flight for the order ticket. Alpaca will not short every
 * listed name; asking first lets the ticket disable the short side and point at
 * a put, instead of surfacing `asset "GPUS" cannot be sold short` after the
 * user has already pressed the button.
 *
 * Unknown symbols and an unconfigured broker both resolve to "we don't know" —
 * the ticket falls back to letting the order through and relies on the broker's
 * (now translated) rejection, which is the safe direction to fail.
 */

import { NextRequest, NextResponse } from "next/server";
import { envCreds, getAsset } from "@/lib/brokers/alpaca";

export interface AssetTradability {
  symbol: string;
  /** Null when the broker couldn't be asked — not the same as "not shortable". */
  shortable: boolean | null;
  tradable: boolean | null;
  easyToBorrow: boolean | null;
  fractionable: boolean | null;
  name?: string;
  exchange?: string;
}

const UNKNOWN = (symbol: string): AssetTradability => ({
  symbol: symbol.toUpperCase(),
  shortable: null,
  tradable: null,
  easyToBorrow: null,
  fractionable: null,
});

export async function GET(req: NextRequest) {
  const symbol = new URL(req.url).searchParams.get("symbol");
  if (!symbol) return NextResponse.json({ error: "Missing 'symbol'" }, { status: 400 });

  // Option (OCC) symbols and crypto pairs have no equity asset record; the
  // shortability question doesn't apply to either.
  if (symbol.includes("/") || symbol.length > 6) {
    return NextResponse.json(UNKNOWN(symbol));
  }

  const creds = envCreds("paper");
  if (!creds) return NextResponse.json(UNKNOWN(symbol));

  try {
    const asset = await getAsset(creds, symbol);
    const view: AssetTradability = {
      symbol: asset.symbol,
      shortable: asset.shortable,
      tradable: asset.tradable,
      easyToBorrow: asset.easy_to_borrow,
      fractionable: asset.fractionable ?? null,
      name: asset.name,
      exchange: asset.exchange,
    };
    // Tradability changes at most daily; caching it keeps this off the request
    // budget that the market-data endpoints are already competing for.
    return NextResponse.json(view, {
      headers: { "Cache-Control": "private, max-age=300, stale-while-revalidate=3600" },
    });
  } catch {
    return NextResponse.json(UNKNOWN(symbol));
  }
}

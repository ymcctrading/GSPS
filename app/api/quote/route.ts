/**
 * GSPS — /api/quote?symbol=BTC
 * Live quote for the header, order ticket, and chart poll. Returns the latest
 * price (including extended-hours prints), the regular-session close, the daily
 * change, and the current market session so the UI can distinguish an
 * after-hours move from the official close.
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchSnapshot, isCryptoSymbol } from "@/lib/data/alpaca";
import { marketSession } from "@/lib/market/session";

export interface LiveQuote {
  symbol: string;
  assetClass: "us_equity" | "crypto";
  price: number;
  /** Reference regular-session close used for the extended-hours comparison. */
  regularClose: number | null;
  prevClose: number | null;
  session: "pre" | "regular" | "post" | "closed";
  /** Change during the current regular session (price vs previous close). */
  changeAbs: number | null;
  changePct: number | null;
  /** Extended-hours move: live price vs the regular-session close. */
  extendedAbs: number | null;
  extendedPct: number | null;
  at: number;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");
  if (!symbol) {
    return NextResponse.json({ error: "Missing 'symbol'" }, { status: 400 });
  }

  const assetClass = isCryptoSymbol(symbol) ? "crypto" : "us_equity";
  try {
    const snap = await fetchSnapshot(symbol, assetClass);
    const session = marketSession(assetClass);

    // In pre-market the day's regular bar hasn't formed, so the reference close
    // is yesterday's; otherwise it's today's completed/forming regular close.
    const regularClose =
      session === "pre" ? snap.prevClose ?? snap.dailyClose : snap.dailyClose ?? snap.prevClose;
    const prevClose = snap.prevClose ?? snap.dailyClose;

    const pct = (from: number | null) =>
      from && from > 0 ? ((snap.price - from) / from) * 100 : null;
    const abs = (from: number | null) => (from ? snap.price - from : null);

    const extended = session === "pre" || session === "post";

    const quote: LiveQuote = {
      symbol: symbol.toUpperCase(),
      assetClass,
      price: snap.price,
      regularClose,
      prevClose,
      session,
      changeAbs: abs(prevClose),
      changePct: pct(prevClose),
      extendedAbs: extended ? abs(regularClose) : null,
      extendedPct: extended ? pct(regularClose) : null,
      at: Date.now(),
    };
    return NextResponse.json(quote);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}

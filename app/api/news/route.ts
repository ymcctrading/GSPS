/**
 * GSPS — /api/news?symbol=X
 *
 * Read side of the symbol page's news (Q3 item 6): the symbol's latest
 * headlines, each beside the close of the session it fell on. See
 * `lib/news/symbolNews.ts` for the design basis.
 *
 * Signed-in members only, the same for every tier. Headlines are Alpaca's news
 * feed (free on the data plan, `fetchNews`); without a live feed the route
 * says news isn't available rather than showing invented items.
 *
 * Engineering choices, labelled: the last `NEWS_LOOKBACK_DAYS` days and at most
 * `NEWS_LIMIT` items; the daily closes read a little further back so the
 * oldest item's session has a prior close; and one read per symbol an hour
 * per server instance (`CACHE_MS`), read again once the day's close has come
 * in, so a read from before the close is not served after it. The plan's "one read a symbol a day" is
 * the exit notes' budget; a page a person opens needs the day's news, so an
 * hour here, which is still at most 24 reads a symbol a day on an instance.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { alpacaConfigured, fetchNews, isCryptoSymbol } from "@/lib/data/alpaca";
import { getMarketDataProvider } from "@/lib/data/provider";
import { dailyBarDate } from "@/lib/scanner/priorClose";
import { etDateKey, etParts } from "@/lib/market/session";
import { isEarlyClose } from "@/lib/market/calendar";
import { pairNewsWithSessions, type SymbolNews } from "@/lib/news/symbolNews";

const NEWS_LOOKBACK_DAYS = 14;
const NEWS_LIMIT = 12;
const DAILY_LOOKBACK_DAYS = 30;
const CACHE_MS = 60 * 60 * 1000;
const SYMBOL = /^[A-Z0-9.\-/]{1,15}$/;

const cache = new Map<
  string,
  { at: number; closed: boolean; value: SymbolNews }
>();

/** A New York date's close as "HH:MM": 1 PM on an NYSE early close, else 4 PM. */
function closeAt(date: string): string {
  return isEarlyClose(date) ? "13:00" : "16:00";
}

/** Whether today's equity session has closed and the delayed feed has its close (20 minutes after). */
function equityDayClosed(now: Date): boolean {
  const [h, m] = closeAt(etDateKey(now)).split(":").map(Number);
  return etParts(now).minutes >= h * 60 + m + 20;
}

/** A timestamp as New York "YYYY-MM-DD HH:MM". */
function etStamp(iso: string): string {
  const d = new Date(iso);
  const { minutes } = etParts(d);
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  return `${etDateKey(d)} ${hh}:${mm}`;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const symbol = (new URL(req.url).searchParams.get("symbol") ?? "")
    .trim()
    .toUpperCase();
  if (!SYMBOL.test(symbol))
    return NextResponse.json(
      { error: "Missing or invalid symbol" },
      { status: 400 },
    );

  const provider = getMarketDataProvider();
  if (!alpacaConfigured() || !provider.isLive) {
    return NextResponse.json(
      { error: "News isn't available right now." },
      { status: 503 },
    );
  }

  const now = new Date();
  const crypto = isCryptoSymbol(symbol);
  const todayClosed = !crypto && equityDayClosed(now);
  const hit = cache.get(symbol);
  if (hit && now.getTime() - hit.at < CACHE_MS && hit.closed === todayClosed)
    return NextResponse.json(hit.value);

  try {
    const [news, bars] = await Promise.all([
      fetchNews(
        symbol,
        new Date(now.getTime() - NEWS_LOOKBACK_DAYS * 86_400_000),
        NEWS_LIMIT,
      ),
      provider.fetchBars(
        symbol,
        "1Day",
        new Date(now.getTime() - DAILY_LOOKBACK_DAYS * 86_400_000),
        null,
        crypto ? "crypto" : "us_equity",
      ),
    ]);
    // Completed sessions only: today's bar is still forming (its UTC day for
    // crypto). An equity's day counts once the delayed feed has its close.
    const today = crypto ? now.toISOString().slice(0, 10) : etDateKey(now);
    const daily = bars.filter((b) => {
      const date = dailyBarDate(b, crypto);
      return date !== null && (date < today || (todayClosed && date === today));
    });
    const value: SymbolNews = {
      symbol,
      readAt: now.toISOString(),
      items: pairNewsWithSessions({ news, daily, crypto, etStamp, closeAt }),
    };
    if (cache.size > 500) cache.clear();
    cache.set(symbol, { at: now.getTime(), closed: todayClosed, value });
    return NextResponse.json(value);
  } catch (err) {
    console.error(
      `news: ${symbol}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return NextResponse.json(
      { error: "News isn't available right now. Try again later." },
      { status: 503 },
    );
  }
}

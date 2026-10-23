/**
 * Alpaca Market Data client (stocks + crypto bars, snapshots, most-actives).
 * Uses the free IEX feed for stocks. All calls are plain fetch — no SDK.
 *
 * Consumers should reach this through the provider seam (`getMarketDataProvider`
 * in ./provider), not import these functions directly, so the data source stays
 * swappable. The `alpacaProvider` export at the bottom adapts this module to the
 * `MarketDataProvider` interface.
 */

import type { AssetClass, Bar, Timeframe } from "@/lib/types";
import type { MarketDataProvider } from "./provider";
import { ALPACA_PROVIDER_LABEL, cachedFetch, fetchWithRetry, MarketDataError } from "./http";
import type { AlertQuote } from "@/lib/alerts/rules";
import { equitySession, etDateKey } from "@/lib/market/session";
import { isCryptoSymbol as isCrypto } from "@/lib/market/cryptoSymbol";

const DATA_BASE = "https://data.alpaca.markets";

/**
 * Alpaca has no commodities/futures endpoint. Without this guard, `"commodity"`
 * would silently fall through every `assetClass === "crypto" ? ... : ...`
 * branch below into the *stocks* path and return wrong-market data with no
 * error — see `lib/data/commodity.ts` for the actual (unconnected) home for
 * this asset class.
 */
function assertAlpacaSupports(assetClass: AssetClass): void {
  if (assetClass === "commodity") {
    throw new Error(
      "Alpaca has no commodities data — this asset class isn't connected yet (see lib/data/commodity.ts).",
    );
  }
}

/**
 * How long a response stays reusable, by endpoint. Quotes and latest trades get
 * a sub-poll-interval window: long enough that the ticker header, the chart, and
 * the order ticket share one upstream call, short enough that the price still
 * ticks. Bars are keyed by an explicit time window, so a longer window is safe.
 */
function ttlFor(path: string): number {
  if (path.includes("/trades/latest") || path.includes("/latest/trades")) return 2_000;
  if (path.includes("/snapshot")) return 2_000;
  if (path.includes("/bars")) return 15_000;
  if (path.includes("most-actives")) return 300_000;
  if (path.includes("/news")) return 300_000;
  return 5_000;
}

// Accept the common Alpaca env-var spellings so a naming mismatch doesn't break data.
function alpacaKeyId(): string | undefined {
  return (
    process.env.ALPACA_API_KEY ??
    process.env.ALPACAP_API ??
    process.env.ALPACA_KEY_ID ??
    process.env.APCA_API_KEY_ID
  );
}
function alpacaSecret(): string | undefined {
  return (
    process.env.ALPACA_API_SECRET ??
    process.env.ALPACA_API_SECRET_KEY ??
    process.env.ALPACA_SECRET_KEY ??
    process.env.APCA_API_SECRET_KEY
  );
}

/** True when both Alpaca credentials are present — used by the provider seam. */
export function alpacaConfigured(): boolean {
  return Boolean(alpacaKeyId() && alpacaSecret());
}

function headers(): Record<string, string> {
  const key = alpacaKeyId();
  const secret = alpacaSecret();
  if (!key || !secret) {
    throw new Error("ALPACA_API_KEY / ALPACA_API_SECRET are not configured");
  }
  return { "APCA-API-KEY-ID": key, "APCA-API-SECRET-KEY": secret };
}

interface AlpacaBar {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

function toBars(raw: AlpacaBar[] | undefined): Bar[] {
  return (raw ?? []).map((b) => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v }));
}

// Untyped boundary: this returns whichever Alpaca market-data payload the
// caller asked for, and each caller narrows the fields it reads. Threading a
// generic through instead pushes `unknown` into a dozen call sites that would
// each need a response interface — worth doing, but as its own change.
//
// Every read goes through the cache + coalescing + retry stack in ./http, so a
// burst of page loads costs one upstream request and a throttled response is
// retried rather than surfaced.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function get(path: string, params: Record<string, string>): Promise<any> {
  const url = new URL(`${DATA_BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  return cachedFetch(url.toString(), ttlFor(path), async () => {
    const res = await fetchWithRetry(
      url,
      { headers: headers(), next: { revalidate: 0 } } as RequestInit,
      { provider: ALPACA_PROVIDER_LABEL },
    );
    return res.json();
  });
}

/** Re-exported so routes can branch on rate limiting without importing ./http. */
export { MarketDataError };

/** Normalize a crypto symbol like BTCUSD or BTC-USD to Alpaca's BTC/USD. */
export function normalizeCryptoSymbol(symbol: string): string {
  if (symbol.includes("/")) return symbol.toUpperCase();
  const s = symbol.toUpperCase().replace("-", "");
  if (s.endsWith("USD")) return `${s.slice(0, -3)}/USD`;
  return `${s}/USD`;
}

export { isCryptoSymbol } from "@/lib/market/cryptoSymbol";

/**
 * App timeframe → Alpaca bar timeframe. Alpaca accepts [1-59]Min, [1-23]Hour,
 * 1Day, 1Week and a fixed set of Month multiples; it has no yearly bar, but
 * 12Month is the same candle.
 */
const ALPACA_TIMEFRAME: Record<Timeframe, string> = {
  "1Year": "12Month",
  "1Month": "1Month",
  "1Week": "1Week",
  "1Day": "1Day",
  "4Hour": "4Hour",
  "2Hour": "2Hour",
  "1Hour": "1Hour",
  "15Min": "15Min",
  "5Min": "5Min",
  "1Min": "1Min",
};

/** Alpaca caps a single bars page at 10k regardless of what `limit` asks for. */
const PAGE_LIMIT = 10000;

/**
 * `includeExtendedHours` (see the `MarketDataProvider` interface doc) is
 * accepted here but deliberately never turned into a query param. Alpaca's
 * `/v2/stocks/bars` endpoint has no `extended_hours` parameter — that field
 * belongs to order placement, not bars queries — and rejects it with a 400.
 * This was already diagnosed and fixed once (CHANGELOG.md, 2026-08-17: "it's
 * an order-placement field, not a bars-query one") after the same 400 had
 * been silently swallowing every intraday bar fetch for ~36 hours. Do not
 * re-add it a third time. The free IEX feed already includes pre/post-market
 * prints in intraday bars with no opt-in required; `EXTENDED_HOURS_TFS` /
 * the chart's "Extended hours" checkbox (`components/chart/candles.tsx`)
 * filters them client-side after the fact.
 */
/**
 * A request window's edge, floored to the minute. Callers build `start` and
 * `end` from `Date.now()`, so to the millisecond no two requests shared a URL
 * and the bar cache in ./http (`ttlFor`, 15 s) could only coalesce identical
 * concurrent calls. Floored, every chart load and scan of one symbol and
 * timeframe on one instance inside the cache's 15 s shares one upstream read
 * (Q2 "Scale safely", 2026-10-22). The window starts up to a minute earlier,
 * which can add one older bar (callers that need an exact start filter on it
 * already), and ends up to a minute earlier, inside the feed's own delay.
 */
function minuteFloor(d: Date): string {
  return new Date(Math.floor(d.getTime() / 60_000) * 60_000).toISOString();
}

/** Shared param-building for the bars endpoint — one or many symbols. */
function barsRequest(
  symbols: string,
  timeframe: Timeframe,
  start: Date,
  end: Date | null,
  assetClass: AssetClass,
  limit: number,
  pageToken?: string,
): { path: string; params: Record<string, string> } {
  assertAlpacaSupports(assetClass);
  const crypto = assetClass === "crypto";
  const path = crypto ? `/v1beta3/crypto/us/bars` : `/v2/stocks/bars`;

  const params: Record<string, string> = {
    timeframe: ALPACA_TIMEFRAME[timeframe] ?? timeframe,
    start: minuteFloor(start),
    symbols,
    sort: "desc",
  };
  if (end) params.end = minuteFloor(end);
  if (!crypto) {
    params.adjustment = "split";
    params.feed = "iex";
  }
  params.limit = String(Math.min(limit, PAGE_LIMIT));
  if (pageToken) params.page_token = pageToken;
  return { path, params };
}

/**
 * Bars for a symbol, oldest → newest.
 *
 * Pages run newest-first (`sort=desc`) and the result is reversed at the end.
 * That ordering matters: when `limit` is smaller than the number of bars in the
 * window, the bars that get dropped are the oldest ones, so a chart always ends
 * at the most recent candle instead of stopping days short of it.
 */
export async function fetchBars(
  symbol: string,
  timeframe: Timeframe,
  start: Date,
  end: Date | null,
  assetClass: AssetClass,
  limit = 10000,
  // Accepted for MarketDataProvider interface compatibility; see barsRequest's
  // doc comment for why it's not turned into a query param.
  _includeExtendedHours = false,
): Promise<Bar[]> {
  const crypto = assetClass === "crypto";
  const sym = crypto ? normalizeCryptoSymbol(symbol) : symbol.toUpperCase();

  const collected: Bar[] = [];
  let pageToken: string | undefined;

  do {
    const remaining = limit - collected.length;
    const { path, params } = barsRequest(
      sym, timeframe, start, end, assetClass, remaining, pageToken,
    );

    const data = await get(path, params);
    const page = toBars(data.bars?.[sym]);
    collected.push(...page);
    pageToken = data.next_page_token ?? undefined;
    // A short page means the window is exhausted even if a token came back.
    if (page.length === 0) break;
  } while (pageToken && collected.length < limit);

  return collected.reverse();
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Symbols per multi-symbol bars request — comfortably under any URL-length limit. */
const BATCH_CHUNK = 100;

/**
 * Bars a symbol prints per calendar day, by timeframe: US equities on IEX
 * trade 4 AM-8 PM New York (16 hours, extended hours included) five days in
 * seven, crypto all day every day. Only an estimate for sizing chunks, never a
 * count anything relies on: a chunk that needs more than one page still drains
 * its `next_page_token`.
 */
const BARS_PER_DAY: Record<Timeframe, { equity: number; crypto: number }> = {
  "1Year": { equity: 1 / 365, crypto: 1 / 365 },
  "1Month": { equity: 1 / 30.4, crypto: 1 / 30.4 },
  "1Week": { equity: 1 / 7, crypto: 1 / 7 },
  "1Day": { equity: 5 / 7, crypto: 1 },
  "4Hour": { equity: (4 * 5) / 7, crypto: 6 },
  "2Hour": { equity: (8 * 5) / 7, crypto: 12 },
  "1Hour": { equity: (16 * 5) / 7, crypto: 24 },
  "15Min": { equity: (64 * 5) / 7, crypto: 96 },
  "5Min": { equity: (192 * 5) / 7, crypto: 288 },
  "1Min": { equity: (960 * 5) / 7, crypto: 1440 },
};

/** Alpaca's bars history starts in 2016; a window reaching further back adds no bars. */
const HISTORY_START_MS = Date.UTC(2016, 0, 1);

/**
 * Symbols per request so each chunk's bars fit one page. Pages of one chunk
 * run one after another (each needs the last one's token), while chunks run
 * side by side, so a shortlist whose window filled two pages waited for two
 * round trips; split in two it waits for one. Alpaca answered the market
 * scan's requests in 5-12 s each on 2026-10-22, so the full pass's two
 * sequential pages per timeframe were most of its 30 s fetch. The request count
 * is about the same either way.
 */
export function batchChunkSize(
  timeframe: Timeframe,
  start: Date,
  end: Date | null,
  assetClass: AssetClass,
  limit: number,
  now: number = Date.now(),
): number {
  const from = Math.max(start.getTime(), HISTORY_START_MS);
  const to = end ? end.getTime() : now;
  const days = Math.max(1, (to - from) / 86_400_000);
  const rate = BARS_PER_DAY[timeframe] ?? BARS_PER_DAY["1Day"];
  const perSymbol = Math.max(1, Math.ceil(days * (assetClass === "crypto" ? rate.crypto : rate.equity)));
  // A tenth of headroom, so a symbol with a few more bars than the estimate
  // doesn't spill a chunk onto a second page.
  const fit = Math.floor((Math.min(limit, PAGE_LIMIT) * 0.9) / perSymbol);
  return Math.min(BATCH_CHUNK, Math.max(1, fit));
}

/**
 * How many chunk requests (and their page-token follow-ups) run at once.
 * Unbounded `Promise.all` across every chunk was fine at the ~500-symbol
 * universe this was built for, but the 2026-09-20 large-cap refresh (~765
 * symbols, ~8 chunks per timeframe, 2 timeframes per scan) turned that into
 * a burst of a dozen-plus simultaneous requests — each daily-bar chunk also
 * paginating (100 symbols x ~252 trading days exceeds the 10,000-row
 * PAGE_LIMIT) — and started tripping Alpaca's free-tier rate limit
 * mid-scan, which the market-scan route had no handling for (see that
 * route's own comment). Capped rather than removed: the batching's whole
 * point is fewer requests than one-per-symbol, this just stops firing all
 * of them at once.
 */
const CHUNK_CONCURRENCY = 3;

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * Bars for many symbols, one timeframe, in a handful of requests instead of
 * one per symbol. Alpaca's `/v2/stocks/bars` accepts a comma-separated symbol
 * list and returns each symbol's bars keyed by symbol — a market scan asking
 * for the same timeframe across dozens or hundreds of symbols was previously
 * the single largest source of request volume (see `runMarketScan`), enough
 * to blow through both Alpaca's per-minute cap and Vercel's function timeout
 * before a scan could finish.
 *
 * `PAGE_LIMIT` bars per page is shared across the *whole* multi-symbol
 * response, not per symbol — 100 symbols x a ~250-bar daily window blows
 * through it in one page, silently dropping every symbol past whichever one
 * filled the page. This drains `next_page_token` the same way the
 * single-symbol `fetchBars` does, merging each page's per-symbol bars, so a
 * chunk that needs more than one page still returns complete data for every
 * symbol in it — just at the cost of an extra request for that chunk.
 */
export async function fetchBarsBatch(
  symbols: string[],
  timeframe: Timeframe,
  start: Date,
  end: Date | null,
  assetClass: AssetClass,
  limit = 10000,
): Promise<Map<string, Bar[]>> {
  const crypto = assetClass === "crypto";
  const syms = Array.from(
    new Set(symbols.map((s) => (crypto ? normalizeCryptoSymbol(s) : s.toUpperCase()))),
  );
  const result = new Map<string, Bar[]>();
  if (syms.length === 0) return result;

  const size = batchChunkSize(timeframe, start, end, assetClass, limit);
  const chunks = chunk(syms, size);
  // Pages and bars read, logged when the reads took more pages than chunks:
  // the market scan's 21:15 UTC run (2026-10-22) spent 85 tokens on monthly
  // bars and 45 on 12 crypto pairs' hourly bars, where the chunk sizes
  // expected one page a chunk.
  let pages = 0;
  let barsRead = 0;
  await mapWithConcurrency(chunks, CHUNK_CONCURRENCY, async (group) => {
    const collected = new Map<string, Bar[]>(group.map((s) => [s, []]));
    let pageToken: string | undefined;

    do {
      const { path, params } = barsRequest(group.join(","), timeframe, start, end, assetClass, limit, pageToken);
      const data = await get(path, params);
      pages += 1;

      let pageBarCount = 0;
      for (const sym of group) {
        const page = toBars(data.bars?.[sym]);
        if (page.length > 0) collected.get(sym)!.push(...page);
        pageBarCount += page.length;
      }
      barsRead += pageBarCount;
      pageToken = data.next_page_token ?? undefined;
      // An empty page means the window is exhausted even if a token came back.
      if (pageBarCount === 0) break;
    } while (pageToken);

    for (const sym of group) result.set(sym, collected.get(sym)!.reverse());
  });

  if (pages > chunks.length) {
    console.log(
      `[market-data] ${assetClass} ${timeframe} bars: ${syms.length} symbols in ${chunks.length} chunks of ` +
        `${size} took ${pages} pages, ${barsRead} bars (${Math.round(barsRead / pages)} a page)`,
    );
  }
  return result;
}

export async function fetchLatestPrice(symbol: string, assetClass: AssetClass): Promise<number> {
  assertAlpacaSupports(assetClass);
  if (assetClass === "crypto") {
    const sym = normalizeCryptoSymbol(symbol);
    const data = await get(`/v1beta3/crypto/us/latest/trades`, { symbols: sym });
    const p = data.trades?.[sym]?.p;
    if (typeof p !== "number") throw new Error(`No latest trade for ${symbol}`);
    return p;
  }
  const data = await get(`/v2/stocks/${symbol.toUpperCase()}/trades/latest`, { feed: "iex" });
  const p = data.trade?.p;
  if (typeof p !== "number") throw new Error(`No latest trade for ${symbol}`);
  return p;
}

/**
 * Latest trade prices for many symbols of one asset class, one request per
 * 100 symbols, so a scan of 56 stocks spends one rate-limit token on prices
 * rather than 56 (the market scan's full pass queued for tokens past its 60 s
 * budget on 2026-10-22). A symbol the feed has no trade for is left out of the
 * map, and the caller reads it one at a time. A refused batch (400/422, one
 * bad symbol) is read one by one, as `fetchAlertQuotes` does.
 */
export async function fetchLatestPrices(symbols: string[], assetClass: AssetClass): Promise<Map<string, number>> {
  assertAlpacaSupports(assetClass);
  const out = new Map<string, number>();
  const crypto = assetClass === "crypto";
  const unique = [...new Set(symbols.map((s) => s.toUpperCase()))];
  for (let i = 0; i < unique.length; i += 100) {
    const keyOf = new Map(unique.slice(i, i + 100).map((s) => [crypto ? normalizeCryptoSymbol(s) : s, s]));
    const read = async (keys: string[]) => {
      const data = crypto
        ? await get(`/v1beta3/crypto/us/latest/trades`, { symbols: keys.join(",") })
        : await get(`/v2/stocks/trades/latest`, { symbols: keys.join(","), feed: "iex" });
      for (const key of keys) {
        const p = data?.trades?.[key]?.p;
        if (typeof p === "number" && Number.isFinite(p)) out.set(keyOf.get(key)!, p);
      }
    };
    try {
      await read([...keyOf.keys()]);
    } catch (err) {
      if (!(err instanceof MarketDataError) || (err.status !== 400 && err.status !== 422)) throw err;
      for (const key of keyOf.keys()) await read([key]).catch(() => undefined);
    }
  }
  return out;
}

export interface Snapshot {
  /** Most recent trade — reflects extended-hours prints on IEX / 24-7 crypto. */
  price: number;
  /** Close of the most recent regular-session daily bar. */
  dailyClose: number | null;
  /** Previous regular-session daily close (yesterday). */
  prevClose: number | null;
  /** Every figure the alert editor can watch (`lib/alerts/rules.ts`). */
  alertQuote: AlertQuote;
}

/** The parts of an Alpaca snapshot the alert figures read. */
interface RawSnapshot {
  latestTrade?: { p?: number };
  latestQuote?: { bp?: number; ap?: number };
  minuteBar?: { c?: number };
  dailyBar?: { t?: string; h?: number; l?: number; c?: number; v?: number };
  prevDailyBar?: { c?: number };
}

const num = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);

/**
 * The alert figures from one Alpaca snapshot. Alpaca's `dailyBar` is the latest
 * daily bar, which before an equity's first trade of the day is yesterday's, so
 * which close is "completed" and which today's change runs from depends on
 * whether that bar is today's and whether the session is still running.
 * Crypto's daily bar (UTC day) is always forming.
 */
export function alertQuoteFromSnapshot(snap: RawSnapshot, assetClass: AssetClass, now: Date = new Date()): AlertQuote {
  // The last trade only: a daily bar's close could be yesterday's and fire a
  // Last alert on a stale price.
  const last = num(snap.latestTrade?.p) ?? num(snap.minuteBar?.c);
  const dailyClose = num(snap.dailyBar?.c);
  const prevClose = num(snap.prevDailyBar?.c);
  const barIsToday = snap.dailyBar?.t != null && etDateKey(new Date(snap.dailyBar.t)) === etDateKey(now);
  const session = equitySession(now);
  const forming = assetClass === "crypto" || (barIsToday && (session === "pre" || session === "regular"));
  const today = assetClass === "crypto" || barIsToday;
  const bid = num(snap.latestQuote?.bp);
  const ask = num(snap.latestQuote?.ap);
  return {
    last,
    bid: bid != null && bid > 0 ? bid : null,
    ask: ask != null && ask > 0 ? ask : null,
    dayHigh: today ? num(snap.dailyBar?.h) : null,
    dayLow: today ? num(snap.dailyBar?.l) : null,
    dayVolume: today ? num(snap.dailyBar?.v) : null,
    completedClose: forming ? prevClose : dailyClose,
    // Before today's first bar the change runs from yesterday's close, except
    // when no session is running (overnight, a weekend or holiday): then it is
    // the last session's own change, as the quote header shows it.
    changeFrom: today || session === "closed" ? prevClose : dailyClose,
  };
}

/**
 * Alert figures for many symbols in a few requests: one batched snapshot call
 * per 100 symbols of an asset class. A symbol the feed has no snapshot for is
 * left out of the map.
 */
export async function fetchAlertQuotes(
  symbols: string[],
  assetClass: AssetClass,
  now: Date = new Date(),
): Promise<Map<string, AlertQuote>> {
  assertAlpacaSupports(assetClass);
  const out = new Map<string, AlertQuote>();
  const crypto = assetClass === "crypto";
  const unique = [...new Set(symbols.map((s) => s.toUpperCase()))];
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    const keyOf = new Map(chunk.map((s) => [crypto ? normalizeCryptoSymbol(s) : s, s]));
    const read = async (keys: string[]) => {
      const data = crypto
        ? (await get(`/v1beta3/crypto/us/snapshots`, { symbols: keys.join(",") })).snapshots ?? {}
        : await get(`/v2/stocks/snapshots`, { symbols: keys.join(","), feed: "iex" });
      for (const key of keys) {
        const snap = data?.[key] as RawSnapshot | undefined;
        if (snap) out.set(keyOf.get(key)!, alertQuoteFromSnapshot(snap, assetClass, now));
      }
    };
    try {
      await read([...keyOf.keys()]);
    } catch (err) {
      // One bad symbol must not cost the rest of the batch: on a refused
      // request read one by one, leaving out any the feed refuses. Any other
      // failure (outage, throttling) is the caller's to fall back from.
      if (!(err instanceof MarketDataError) || (err.status !== 400 && err.status !== 422)) throw err;
      for (const key of keyOf.keys()) await read([key]).catch(() => undefined);
    }
  }
  return out;
}

/**
 * Snapshot: latest trade plus today's and yesterday's daily bars. Lets the UI
 * separate the live (possibly extended-hours) print from the regular close.
 */
export async function fetchSnapshot(symbol: string, assetClass: AssetClass): Promise<Snapshot> {
  assertAlpacaSupports(assetClass);
  if (assetClass === "crypto") {
    const sym = normalizeCryptoSymbol(symbol);
    const data = await get(`/v1beta3/crypto/us/snapshots`, { symbols: sym });
    const snap = data.snapshots?.[sym] ?? {};
    const price = snap.latestTrade?.p ?? snap.dailyBar?.c;
    if (typeof price !== "number") throw new Error(`No snapshot for ${symbol}`);
    return {
      price,
      dailyClose: snap.dailyBar?.c ?? null,
      prevClose: snap.prevDailyBar?.c ?? null,
      alertQuote: alertQuoteFromSnapshot(snap, assetClass),
    };
  }
  const sym = symbol.toUpperCase();
  const snap = await get(`/v2/stocks/${sym}/snapshot`, { feed: "iex" });
  const price = snap.latestTrade?.p ?? snap.minuteBar?.c ?? snap.dailyBar?.c;
  if (typeof price !== "number") throw new Error(`No snapshot for ${symbol}`);
  return {
    price,
    dailyClose: snap.dailyBar?.c ?? null,
    prevClose: snap.prevDailyBar?.c ?? null,
    alertQuote: alertQuoteFromSnapshot(snap, assetClass),
  };
}

/**
 * Latest trade price for one option contract (OCC symbol), or null when
 * there's nothing to read — no options market-data subscription on this
 * account, the contract hasn't traded, or the upstream call failed. Callers
 * are expected to fall back (to the contract's daily close, or the ticket's
 * own known premium) rather than treat null as an error; this app has no
 * guaranteed options quote feed, only a best-effort one.
 */
export async function fetchOptionLatestTrade(occSymbol: string): Promise<number | null> {
  try {
    const sym = occSymbol.toUpperCase();
    const data = await get(`/v1beta1/options/trades/latest`, { symbols: sym });
    const p = data.trades?.[sym]?.p;
    return typeof p === "number" ? p : null;
  } catch {
    return null;
  }
}

/** Most-active US equities by volume — the coarse universe for the daily market scan. */
export async function fetchMostActives(top = 100): Promise<string[]> {
  const data = await get(`/v1beta1/screener/stocks/most-actives`, {
    by: "volume",
    top: String(top),
  });
  return (data.most_actives ?? []).map((a: { symbol: string }) => a.symbol);
}

/**
 * Adapter exposing this module as a `MarketDataProvider`. Alpaca's free IEX feed
 * doesn't include an options chain or Level II depth, so those optional methods
 * are intentionally omitted — the API routes derive a simulated view instead.
 */
export const alpacaProvider: MarketDataProvider = {
  name: "alpaca",
  isLive: true,
  fetchBars,
  fetchBarsBatch,
  fetchLatestPrice,
  fetchLatestPrices,
  fetchMostActives,
  fetchAlertQuotes,
};

/**
 * News items on `symbol` published from `start` (Alpaca's news API, on every
 * plan). Headlines only: no sentiment is read from them. See
 * `lib/gann/badNews.ts` for the one place they are used.
 */
export async function fetchNews(symbol: string, start: Date, limit = 10): Promise<{ createdAt: string; headline: string }[]> {
  const json = await get("/v1beta1/news", {
    symbols: isCrypto(symbol) ? normalizeCryptoSymbol(symbol).replace("/", "") : symbol.toUpperCase(),
    start: start.toISOString(),
    limit: String(limit),
    sort: "desc",
  });
  const items: { created_at?: string; headline?: string }[] = json?.news ?? [];
  return items
    .filter((n) => typeof n.created_at === "string" && typeof n.headline === "string")
    .map((n) => ({ createdAt: n.created_at as string, headline: n.headline as string }));
}

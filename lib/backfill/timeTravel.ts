/**
 * Time travel for the daily scan backfill (scripts/backfill-daily-scans.mjs).
 *
 * The live scan reads the wall clock and asks Alpaca for "the latest" bars and
 * trades. To rebuild a day the scan missed (production was down from Oct 31,
 * 2026 while Vercel paused the account), the backfill runs the same production
 * scan code with:
 *
 *  1. a clock set to that day's evening scan time (19:00 ET, the `gsps-evening-
 *     market-scan` slot, migration 0144), so every `new Date()` / `Date.now()`
 *     in the scan reads that moment, and
 *  2. a fetch that cannot see past that clock: every bars request has its
 *     `end` cut to the clock and any bar not yet closed by then dropped, a
 *     "latest trade" is rebuilt from the last bar closed by the clock, and
 *     anything that would read the present (the most-actives screener, quotes,
 *     snapshots) is refused, so the scan falls back the way it does when that
 *     read fails.
 *
 * It also refuses every write the scan would make on its own (stores, telemetry,
 * ledgers) and every host other than Alpaca's market data and the database.
 * The backfill writes `daily_scans` itself, with a client that bypasses this
 * fetch.
 *
 * Research/ops tool only: nothing in the app imports this module.
 *
 * Three-question mandate: (1) Gann judged the day's charts after the close
 * (*Truth of the Stock Tape* pp.5-7), which is exactly what the clock at 19:00
 * ET gives each rebuilt day; no rule changes. (2) Cycles: the backfill is a
 * one-off repair, not a recurring process, so no cycle applies. (3) Hermetic:
 * Cause and Effect, each day's plan from only what was knowable that day.
 */

import { etInstant } from "@/lib/data/timeliness";
import { isTradingDay } from "@/lib/market/calendar";

/** The evening scan's ET clock time, in minutes after midnight (19:00). */
export const BACKFILL_SCAN_MINUTES_ET = 19 * 60;

/** The instant a rebuilt day's scan runs at: 19:00 ET on that date. */
export function backfillClock(day: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`not a YYYY-MM-DD date: ${day}`);
  return etInstant(day, BACKFILL_SCAN_MINUTES_ET);
}

/** Every NYSE trading day from `from` to `to`, inclusive, as YYYY-MM-DD. */
export function tradingDaysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const end = Date.parse(`${to}T12:00:00Z`);
  for (let t = Date.parse(`${from}T12:00:00Z`); t <= end; t += 86_400_000) {
    const day = new Date(t).toISOString().slice(0, 10);
    if (isTradingDay(new Date(`${day}T17:00:00Z`))) out.push(day);
  }
  return out;
}

/** The day after a YYYY-MM-DD date. */
export function nextDay(day: string): string {
  return new Date(Date.parse(`${day}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

/**
 * Replace the global `Date` so that `new Date()` and `Date.now()` read `at`,
 * moving forward at the real rate (timeouts and deadlines still measure real
 * time). Returns a function that restores the real `Date`.
 */
export function installFakeClock(at: Date): () => void {
  const RealDate = globalThis.Date;
  const offset = at.getTime() - RealDate.now();
  class ClockDate extends RealDate {
    constructor(...args: unknown[]) {
      if (args.length === 0) super(RealDate.now() + offset);
      else super(...(args as [string | number | Date]));
    }
    static now(): number {
      return RealDate.now() + offset;
    }
  }
  globalThis.Date = ClockDate as DateConstructor;
  return () => {
    globalThis.Date = RealDate;
  };
}

export interface TimeTravelStats {
  /** Bars requests whose `end` was cut to the clock. */
  barsRequests: number;
  /** Bars the upstream returned that were not closed by the clock, dropped. */
  droppedBars: number;
  /** Latest-trade reads answered from the last bar closed by the clock. */
  rebuiltTrades: number;
  /** Reads refused because they read the present (screener, quotes, snapshots). */
  refusedReads: string[];
  /** Database writes the scan tried to make, refused (method and path). */
  refusedWrites: string[];
  /** Requests to any other host, refused (method, host and path). */
  refusedHosts: string[];
  /** Database tables and functions read (paths), so a reviewer can check none holds rows past the clock. */
  dbReads: string[];
}

const ALPACA_DATA_HOST = "data.alpaca.markets";

/** Milliseconds an intraday Alpaca timeframe spans ("15Min", "1Hour", "1T"); null for day and longer. */
export function intradayBarMs(timeframe: string | null): number | null {
  if (!timeframe) return null;
  const m = /^(\d+)(Min|T)$/.exec(timeframe);
  if (m) return Number(m[1]) * 60_000;
  const h = /^(\d+)(Hour|H)$/.exec(timeframe);
  if (h) return Number(h[1]) * 3_600_000;
  return null;
}

/**
 * Whether a bar the scan would have been able to read at `clock`: an intraday
 * bar once it has closed (open + its span); a day, week or month bar once it
 * has opened, as the live evening scan reads today's daily bar and the week
 * and month in progress.
 */
export function barVisible(barOpen: string, timeframe: string | null, clock: Date): boolean {
  const t = Date.parse(barOpen);
  if (!Number.isFinite(t)) return false;
  const span = intradayBarMs(timeframe);
  return span === null ? t <= clock.getTime() : t + span <= clock.getTime();
}

type Bar = { t: string; c: number };

function filterBars(body: unknown, timeframe: string | null, clock: Date, stats: TimeTravelStats): unknown {
  if (!body || typeof body !== "object") return body;
  const b = body as { bars?: unknown };
  const keep = (list: unknown) => {
    if (!Array.isArray(list)) return list;
    const kept = list.filter((x: Bar) => x && typeof x.t === "string" && barVisible(x.t, timeframe, clock));
    stats.droppedBars += list.length - kept.length;
    return kept;
  };
  if (Array.isArray(b.bars)) return { ...b, bars: keep(b.bars) };
  if (b.bars && typeof b.bars === "object") {
    const out: Record<string, unknown> = {};
    for (const [sym, list] of Object.entries(b.bars as Record<string, unknown>)) out[sym] = keep(list);
    return { ...b, bars: out };
  }
  return body;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function refused(what: string): Response {
  // 403: refused, and not retried by lib/data/http.ts (only 429 and 5xx are).
  return json({ message: `refused by the backfill's time travel: ${what}` }, 403);
}

function requestUrl(input: RequestInfo | URL): URL {
  if (input instanceof URL) return input;
  if (typeof input === "string") return new URL(input);
  return new URL(input.url);
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  return (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
}

/**
 * A `fetch` that answers as the world stood at `clock`. `supabaseUrl` is the
 * database's base URL: its reads pass (except the crypto closed-bars store,
 * which holds bars past the clock and is read as empty so the scan fetches
 * them, cut, from Alpaca), and its writes are refused with an empty success so
 * the scan carries on.
 */
export function makeTimeTravelFetch(
  clock: Date,
  realFetch: typeof fetch,
  opts: { supabaseUrl?: string | null } = {},
): { fetch: typeof fetch; stats: TimeTravelStats } {
  const stats: TimeTravelStats = { barsRequests: 0, droppedBars: 0, rebuiltTrades: 0, refusedReads: [], refusedWrites: [], refusedHosts: [], dbReads: [] };
  const clockIso = clock.toISOString();
  const dbHost = opts.supabaseUrl ? new URL(opts.supabaseUrl).host : null;

  const latestTrades = async (url: URL, init: RequestInit | undefined): Promise<Response> => {
    const crypto = url.pathname.startsWith("/v1beta3/crypto/");
    const single = /^\/v2\/stocks\/([^/]+)\/trades\/latest$/.exec(url.pathname);
    const symbols = single ? [decodeURIComponent(single[1])] : (url.searchParams.get("symbols") ?? "").split(",").filter(Boolean);
    const barsUrl = new URL(`https://${ALPACA_DATA_HOST}${crypto ? "/v1beta3/crypto/us/bars" : "/v2/stocks/bars"}`);
    barsUrl.searchParams.set("symbols", symbols.join(","));
    // Stocks: the last daily bar by the clock (the day's close, the price the
    // evening scan's latest IEX trade sits at). Crypto: the last closed minute.
    // Split-adjusted, as the scan's own bars are (lib/data/alpaca.ts), so the
    // price and the bars are in the same units even if the stock has split
    // since the day; such a stock is then dropped by `splitSinceDay` below.
    barsUrl.searchParams.set("timeframe", crypto ? "1Min" : "1Day");
    barsUrl.searchParams.set("start", new Date(clock.getTime() - (crypto ? 3 : 14 * 24) * 3_600_000).toISOString());
    barsUrl.searchParams.set("end", clockIso);
    barsUrl.searchParams.set("sort", "desc");
    barsUrl.searchParams.set("limit", "10000");
    if (!crypto) {
      barsUrl.searchParams.set("feed", url.searchParams.get("feed") ?? "iex");
      barsUrl.searchParams.set("adjustment", "split");
    }
    const res = await realFetch(barsUrl, { headers: init?.headers });
    if (!res.ok) return res;
    const body = filterBars(await res.json(), crypto ? "1Min" : "1Day", clock, stats) as { bars?: Record<string, Bar[]> };
    const trades: Record<string, { t: string; p: number; s: number }> = {};
    for (const sym of symbols) {
      const list = body.bars?.[sym] ?? [];
      const last = list.reduce<Bar | null>((a, x) => (!a || Date.parse(x.t) > Date.parse(a.t) ? x : a), null);
      if (last && Number.isFinite(last.c)) {
        trades[sym] = { t: last.t, p: last.c, s: 0 };
        stats.rebuiltTrades++;
      }
    }
    if (single) {
      const t = trades[symbols[0]];
      return t ? json({ symbol: symbols[0], trade: t }) : json({ message: "no trade by the clock" }, 404);
    }
    return json({ trades });
  };

  const travel = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = requestUrl(input);
    const method = requestMethod(input, init);

    if (url.host === ALPACA_DATA_HOST) {
      if (method !== "GET") {
        stats.refusedReads.push(`${method} ${url.pathname}`);
        return refused(`${method} ${url.pathname}`);
      }
      if (url.pathname.endsWith("/bars")) {
        const end = url.searchParams.get("end");
        if (!end || Date.parse(end) > clock.getTime()) url.searchParams.set("end", clockIso);
        const start = url.searchParams.get("start");
        if (start && Date.parse(start) > clock.getTime()) url.searchParams.set("start", clockIso);
        stats.barsRequests++;
        const res = await realFetch(url, { ...init, method: "GET" });
        if (!res.ok) return res;
        return json(filterBars(await res.json(), url.searchParams.get("timeframe"), clock, stats), res.status);
      }
      // Stocks: /v2/stocks/trades/latest and /v2/stocks/{sym}/trades/latest;
      // crypto: /v1beta3/crypto/us/latest/trades.
      if (url.pathname.endsWith("/trades/latest") || url.pathname.endsWith("/latest/trades")) return latestTrades(url, init);
      if (url.pathname === "/v1beta1/news") {
        const end = url.searchParams.get("end");
        if (!end || Date.parse(end) > clock.getTime()) url.searchParams.set("end", clockIso);
        return realFetch(url, { ...init, method: "GET" });
      }
      // The screener, quotes, snapshots and options read the present. Refused,
      // so the scan takes the path it takes when that read fails.
      stats.refusedReads.push(url.pathname);
      return refused(url.pathname);
    }

    if (dbHost && url.host === dbHost) {
      if (method === "GET" || method === "HEAD") {
        stats.dbReads.push(url.pathname);
        if (url.pathname === "/rest/v1/closed_bars") return json([]);
        return realFetch(input, init);
      }
      stats.refusedWrites.push(`${method} ${url.pathname}`);
      return new Response(null, { status: 204 });
    }

    // The broker (the shortable check fails open when it is unreachable), email,
    // push and anything else: refused.
    stats.refusedHosts.push(`${method} ${url.host}${url.pathname.replace(/\/assets\/[^/]+$/, "/assets/{symbol}")}`);
    return refused(url.host);
  };

  return { fetch: travel as typeof fetch, stats };
}

/**
 * Which stocks have split since the clock. Alpaca applies a split adjustment
 * as of the day the request is made, so a backfilled row for a stock that split
 * afterwards would carry its plan in post-split units, which a member never saw
 * on that day. Compares each symbol's last daily close by the clock, raw and
 * split-adjusted: a split moves the ratio by a whole factor (2:1, 3:2, 1:10), so
 * any difference over half a percent counts. Crypto pairs (with a "/") carry no
 * split and are skipped. A symbol with no bar in either series is not flagged.
 */
export function splitSince(raw: Record<string, Bar[]>, split: Record<string, Bar[]>): string[] {
  const last = (list: Bar[] | undefined) =>
    (list ?? []).reduce<Bar | null>((a, x) => (!a || Date.parse(x.t) > Date.parse(a.t) ? x : a), null);
  const out: string[] = [];
  for (const sym of Object.keys(raw)) {
    const r = last(raw[sym]);
    const a = last(split[sym]);
    if (!r || !a || !(r.c > 0) || !(a.c > 0) || r.t !== a.t) continue;
    if (Math.abs(r.c / a.c - 1) > 0.005) out.push(sym);
  }
  return out.sort();
}

/** Reads the raw and split-adjusted daily closes by the clock and returns the stocks that split since. */
export async function splitSinceDay(symbols: string[], clock: Date, realFetch: typeof fetch): Promise<string[]> {
  const stocks = [...new Set(symbols.filter((s) => !s.includes("/")))];
  const flagged: string[] = [];
  for (let i = 0; i < stocks.length; i += 100) {
    const chunk = stocks.slice(i, i + 100);
    const read = async (adjustment: string) => {
      const u = new URL(`https://${ALPACA_DATA_HOST}/v2/stocks/bars`);
      u.searchParams.set("symbols", chunk.join(","));
      u.searchParams.set("timeframe", "1Day");
      u.searchParams.set("start", new Date(clock.getTime() - 14 * 86_400_000).toISOString());
      u.searchParams.set("end", clock.toISOString());
      u.searchParams.set("adjustment", adjustment);
      u.searchParams.set("feed", "iex");
      u.searchParams.set("limit", "10000");
      const res = await realFetch(u);
      if (!res.ok) throw new Error(`split check: Alpaca answered ${res.status}`);
      const body = (await res.json()) as { bars?: Record<string, Bar[]> };
      return body.bars ?? {};
    };
    const [raw, split] = await Promise.all([read("raw"), read("split")]);
    flagged.push(...splitSince(raw, split));
  }
  return flagged.sort();
}

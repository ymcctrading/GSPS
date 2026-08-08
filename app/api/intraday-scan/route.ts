/**
 * GSPS — /api/intraday-scan
 *
 * On-demand intraday momentum scan. Deliberately *not* a cron: this project
 * runs on Vercel's Hobby plan, which caps scheduled jobs at two per project and
 * one run per day (see docs/THIRD_PARTY_LIMITS.md), and both slots are already
 * spent on the daily market scan. A scan that needs to run every few minutes
 * during the session cannot come from `vercel.json`, so it is served here and
 * driven by the Scanner page while a user has it open. An external scheduler
 * can call the same endpoint later without any change to this file.
 *
 * Market data only. Nothing here touches broker or order state — those are
 * different sources with different trust properties, and the separation is
 * deliberate.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMarketDataProvider } from "@/lib/data/provider";
import { isCryptoSymbol } from "@/lib/data/alpaca";
import { atr } from "@/lib/analysis/pivots";
import { etParts } from "@/lib/market/session";
import {
  DEFAULT_CONFIG,
  WATCHLIST,
  barsForSession,
  etDateKey,
  scanIntraday,
  volumeBaseline,
  type AssetKind,
  type ScannerConfig,
  type SymbolInput,
} from "@/lib/scanner/intraday";
import type { Bar } from "@/lib/types";

export const maxDuration = 120;

/** Sessions of history behind the relative-volume baseline and the daily ATR. */
const BASELINE_DAYS = 12;
const DAILY_ATR_DAYS = 45;

/** Bounded so a hand-typed symbol list can't turn into an unbounded fan-out. */
const MAX_SYMBOLS = 25;

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const params = new URL(req.url).searchParams;
  const universe = resolveUniverse(params.get("symbols"));
  const config = resolveConfig(params);
  const provider = getMarketDataProvider();

  const now = new Date();
  const todayEt = etDateKey(now);
  const nowEtMinute = etParts(now).minutes;

  const inputs = await mapWithConcurrency(universe, 4, (entry) =>
    buildInput(entry, todayEt, provider),
  );

  const resolved = inputs.filter((i): i is SymbolInput => i !== null);
  const unreachable = universe
    .filter((u) => !resolved.some((r) => r.symbol === u.symbol))
    .map((u) => u.symbol);

  const output = scanIntraday(resolved, config, now);

  return NextResponse.json({
    ...output,
    // Freshness and provenance travel with the result. A scan run against the
    // synthetic demo provider must never be presentable as a live one.
    dataSource: provider.name,
    dataIsLive: provider.isLive,
    session: sessionLabelFor(nowEtMinute, now),
    // Symbols whose market data could not be fetched at all. Reported, not
    // dropped: "we didn't scan it" is different from "we scanned it and it was
    // quiet", and the caller has to be able to say which.
    unreachable,
  });
}

/** Symbols to scan: the caller's list, or the core watchlist. */
function resolveUniverse(param: string | null): { symbol: string; kind: AssetKind }[] {
  if (!param?.trim()) return WATCHLIST;

  const requested = param
    .split(/[,\s]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, MAX_SYMBOLS);

  const seen = new Set<string>();
  const universe: { symbol: string; kind: AssetKind }[] = [];
  for (const symbol of requested) {
    if (seen.has(symbol)) continue;
    seen.add(symbol);
    universe.push({ symbol, kind: kindFor(symbol) });
  }
  return universe.length > 0 ? universe : WATCHLIST;
}

/**
 * Asset kind for a symbol the user typed.
 *
 * The watchlist's own classifications win — they are curated. Everything else
 * falls back to crypto-pair detection and, failing that, "equity". Index
 * symbols are not inferred: the approved market-data sources carry no index
 * quotes, so claiming a symbol is an index would promise data that cannot be
 * delivered.
 */
function kindFor(symbol: string): AssetKind {
  const known = WATCHLIST.find((w) => w.symbol === symbol);
  if (known) return known.kind;
  return isCryptoSymbol(symbol) ? "crypto" : "equity";
}

/** Detection thresholds are query-tunable so a mode can be selected per scan. */
function resolveConfig(params: URLSearchParams): ScannerConfig {
  const num = (key: string, fallback: number): number => {
    const raw = params.get(key);
    if (raw === null) return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  };

  return {
    openingRangeMinutes: num("openingRange", DEFAULT_CONFIG.openingRangeMinutes),
    relativeVolumeThreshold: num("rvol", DEFAULT_CONFIG.relativeVolumeThreshold),
    atrExpansionMultiple: num("atrMultiple", DEFAULT_CONFIG.atrExpansionMultiple),
    unusualVolumeThreshold: num("unusualVolume", DEFAULT_CONFIG.unusualVolumeThreshold),
    minMovePct: num("minMovePct", DEFAULT_CONFIG.minMovePct),
    maxDataAgeSeconds: num("maxDataAge", DEFAULT_CONFIG.maxDataAgeSeconds),
    cooldownMinutes: num("cooldown", DEFAULT_CONFIG.cooldownMinutes),
    minSessionVolume: num("minVolume", DEFAULT_CONFIG.minSessionVolume),
  };
}

type Provider = ReturnType<typeof getMarketDataProvider>;

/**
 * Assemble one symbol's scan input from three bar series.
 *
 * Minute bars for the live session (the resolution a fast move needs),
 * five-minute bars across recent sessions for the same-time-of-day volume
 * baseline, and daily bars for the previous close and the symbol's usual range.
 *
 * Any failure returns null rather than a partially-populated input: a scan
 * running on half a symbol's data produces confident nonsense, and the caller
 * reports the symbol as unreachable instead.
 */
async function buildInput(
  entry: { symbol: string; kind: AssetKind },
  todayEt: string,
  provider: Provider,
): Promise<SymbolInput | null> {
  const { symbol, kind } = entry;
  const assetClass = kind === "crypto" ? "crypto" : "us_equity";

  // Crypto has no feed delay. Free IEX stock data can't serve the most recent
  // ~15 minutes, and asking for it returns an empty tail rather than an error —
  // which would look like a symbol that stopped trading.
  const end =
    assetClass === "crypto" || !provider.isLive ? null : new Date(Date.now() - 16 * 60 * 1000);

  try {
    const [minuteBars, baselineBars, dailyBars] = await Promise.all([
      provider.fetchBars(symbol, "1Min", startOfDayUtc(), end, assetClass, 2000),
      provider.fetchBars(symbol, "5Min", daysAgo(BASELINE_DAYS), end, assetClass, 5000),
      provider.fetchBars(symbol, "1Day", daysAgo(DAILY_ATR_DAYS), end, assetClass, 200),
    ]);

    const sessionBars = pickSessionBars(minuteBars, baselineBars, todayEt);
    if (sessionBars.bars.length === 0) return null;

    const last = sessionBars.bars[sessionBars.bars.length - 1];

    return {
      symbol,
      kind,
      bars: sessionBars.bars,
      barIntervalMinutes: sessionBars.intervalMinutes,
      prevClose: previousClose(dailyBars, todayEt),
      quote: { price: last.c, at: last.t },
      // The baseline must cover exactly the window today's bars cover, not the
      // window the wall clock covers. The free IEX feed can't serve the most
      // recent ~15 minutes, so today's cumulative volume stops there while a
      // baseline measured to `now` kept counting — which made every symbol read
      // roughly 0.5x normal through the morning and suppressed the alerts this
      // scanner exists to produce. Measure the baseline to the last bar we
      // actually received.
      volumeBaseline: volumeBaseline(baselineBars, etParts(new Date(last.t)).minutes, todayEt),
      dailyAtr: dailyBars.length > 2 ? atr(dailyBars.slice(-20), 14) : null,
      // Alerts are not persisted yet, so nothing is suppressed across runs.
      // Within a run, each symbol is evaluated once. See the deferred-work note
      // in the route's response contract.
      lastAlerts: [],
    };
  } catch {
    return null;
  }
}

/**
 * Today's session bars at the best resolution available.
 *
 * Minute bars are preferred. When the feed returns none for today — which
 * happens on a thinly-traded name, or when the delayed window swallows a short
 * session — the five-minute series is used instead, and the caller is told
 * which, because a signal derived from five-minute bars can miss a move that
 * reverses inside one.
 */
function pickSessionBars(
  minuteBars: Bar[],
  fallbackBars: Bar[],
  todayEt: string,
): { bars: Bar[]; intervalMinutes: number } {
  const minute = barsForSession(minuteBars, todayEt);
  if (minute.length > 0) return { bars: minute, intervalMinutes: 1 };
  return { bars: barsForSession(fallbackBars, todayEt), intervalMinutes: 5 };
}

/** The last daily close before today. Null when the history doesn't reach it. */
function previousClose(dailyBars: Bar[], todayEt: string): number | null {
  for (let i = dailyBars.length - 1; i >= 0; i--) {
    const bar = dailyBars[i];
    if (Number.isNaN(Date.parse(bar.t))) continue;
    if (etDateKey(new Date(bar.t)) === todayEt) continue;
    return bar.c > 0 ? bar.c : null;
  }
  return null;
}

function startOfDayUtc(): Date {
  // Two calendar days back, so an Eastern session that began "yesterday" in UTC
  // terms is fully inside the window.
  return daysAgo(2);
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 3600 * 1000);
}

/**
 * The session label shown next to every result, so a scan run at 08:00 or on a
 * Saturday is never mistaken for a live one.
 */
function sessionLabelFor(nowEtMinute: number, now: Date): string {
  const weekday = etParts(now).weekday;
  if (weekday === 0 || weekday === 6) return "Weekend — US equity markets are closed";
  if (nowEtMinute < 4 * 60) return "Overnight — US equity markets are closed";
  if (nowEtMinute < 9 * 60 + 30) return "Pre-market";
  if (nowEtMinute < 16 * 60) return "Regular session";
  if (nowEtMinute < 20 * 60) return "After hours";
  return "Closed";
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const index = i++;
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

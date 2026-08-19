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
import { equitySession, etParts } from "@/lib/market/session";
import { readLiquidity } from "@/lib/scan/liquidity";
import {
  DEFAULT_CONFIG,
  WATCHLIST,
  barsForSession,
  etDateKey,
  scanIntraday,
  volumeBaseline,
  type Alert,
  type AssetKind,
  type Direction,
  type ScannerConfig,
  type SignalType,
  type SymbolInput,
} from "@/lib/scanner/intraday";
import type { Bar } from "@/lib/types";
import { dispatchNotification, type DispatchSupabase } from "@/lib/notifications/dispatch";

export const maxDuration = 120;

/**
 * Same "Execute" threshold lib/scoring/score.ts uses on the daily-scan 0-9
 * scale, and the default `notification_preferences.min_score` — an alert
 * below this isn't "high-confidence" so it never reaches the dispatcher.
 */
const HIGH_CONFIDENCE_SCORE = 7;

/** Sessions of history behind the relative-volume baseline and the daily ATR. */
const BASELINE_DAYS = 12;
const DAILY_ATR_DAYS = 45;

/**
 * `intraday_alerts` (migration 0008) was shaped for the confluence scan, so
 * three of its columns carry intraday values under names that don't say so.
 * The mapping is stated once, here, and used by both the read and the write —
 * a round trip that disagrees with itself would silently disable the cooldown.
 *
 *   signal_id            ← the signal mode ("unusual_volume", …). Also what
 *                          makes the table's (user, symbol, signal_id,
 *                          poll_cycle_timestamp) key mean one row per
 *                          symbol+mode per scan, which is the grain we want.
 *   signal_type          ← direction, in the vocabulary its CHECK allows
 *                          ("up" → bullish, "down" → bearish).
 *   poll_cycle_timestamp ← when the scan ran; the cooldown's clock.
 *
 * `score` is NOT NULL and bounded 0–9, but an intraday alert carries a 0–100
 * confidence. It is banded to fit and the true value kept in `metadata`.
 */
type PriorAlert = NonNullable<SymbolInput["lastAlerts"]>[number];

const DIRECTION_TO_SIGNAL_TYPE: Record<Direction, string> = { up: "bullish", down: "bearish" };

/** How far back the cooldown can possibly look, whatever `cooldownMinutes` is. */
const COOLDOWN_LOOKBACK_HOURS = 24;

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

  // Cooldown history for the whole universe in one query rather than one per
  // symbol — the fan-out is already bounded at MAX_SYMBOLS, and a round trip
  // per symbol would dominate the scan's latency.
  const priorAlerts = await loadPriorAlerts(
    supabase,
    universe.map((u) => u.symbol),
    now,
  );

  const inputs = await mapWithConcurrency(universe, 4, async (entry) =>
    buildInput(entry, todayEt, provider, priorAlerts.get(entry.symbol) ?? [], now),
  );

  const resolved = inputs.filter((i): i is SymbolInput => i !== null);
  const unreachable = universe
    .filter((u) => !resolved.some((r) => r.symbol === u.symbol))
    .map((u) => u.symbol);

  const output = scanIntraday(resolved, config, now);

  // Persisting the alerts is what makes the cooldown survive across runs, but
  // it is not what the caller asked for. A write failure must not discard a
  // scan that already succeeded — it is reported alongside the result and the
  // cooldown degrades to within-run only, which is where it was before.
  const alertsPersisted = await persistAlerts(supabase, user.id, user.email ?? null, output.alerts, resolved);

  return NextResponse.json({
    ...output,
    alertsPersisted,
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
type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Every symbol's recent alerts, in one query, keyed by symbol.
 *
 * Rows are scoped to the signed-in user by RLS; the explicit `user_id` filter
 * says so at the call site rather than relying on a policy defined elsewhere.
 * A read failure yields an empty map — the cooldown then suppresses nothing,
 * which shows a duplicate alert rather than hiding a real one.
 */
async function loadPriorAlerts(
  supabase: Supabase,
  symbols: string[],
  now: Date,
): Promise<Map<string, PriorAlert[]>> {
  const bySymbol = new Map<string, PriorAlert[]>();
  if (symbols.length === 0) return bySymbol;

  const since = new Date(now.getTime() - COOLDOWN_LOOKBACK_HOURS * 3600_000).toISOString();
  const { data, error } = await supabase
    .from("intraday_alerts")
    .select("symbol, signal_id, signal_type, poll_cycle_timestamp")
    .in("symbol", symbols)
    .gte("poll_cycle_timestamp", since)
    .order("poll_cycle_timestamp", { ascending: false });

  if (error || !data) return bySymbol;

  for (const row of data) {
    const prior: PriorAlert = {
      type: row.signal_id as SignalType,
      direction: row.signal_type === "bearish" ? "down" : "up",
      at: row.poll_cycle_timestamp,
    };
    const existing = bySymbol.get(row.symbol);
    if (existing) existing.push(prior);
    else bySymbol.set(row.symbol, [prior]);
  }
  return bySymbol;
}

/**
 * Record this run's alerts so the cooldown outlives the request.
 *
 * One statement for the batch, and failure is reported rather than thrown: the
 * scan the caller asked for has already succeeded by this point, and losing it
 * to a bookkeeping write would repeat the fault that stopped the daily scan
 * saving for four days.
 */
async function persistAlerts(
  supabase: Supabase,
  userId: string,
  userEmail: string | null,
  alerts: Alert[],
  inputs: SymbolInput[],
): Promise<boolean> {
  if (alerts.length === 0) return true;

  const intervalBySymbol = new Map(inputs.map((i) => [i.symbol, i.barIntervalMinutes]));

  const rows = alerts.map((alert) => ({
    user_id: userId,
    symbol: alert.symbol,
    signal_id: alert.type,
    alert_type: "new_signal",
    // 0–100 confidence banded into the column's 0–9 range; the unrounded value
    // travels in metadata so nothing depends on the lossy copy.
    score: Math.max(0, Math.min(9, Math.round((alert.confidence / 100) * 9))),
    signal_type: DIRECTION_TO_SIGNAL_TYPE[alert.direction],
    timeframe: intervalBySymbol.get(alert.symbol) === 5 ? "5m" : "1m",
    entry_level: alert.move.current,
    stop_loss_level: alert.invalidation,
    take_profit_1_level: alert.continuationPlan.firstTarget,
    poll_cycle_timestamp: alert.triggerTime,
    metadata: {
      confidence: alert.confidence,
      direction: alert.direction,
      relativeVolume: alert.relativeVolume,
      dataTimestamp: alert.dataTimestamp,
    },
  }));

  const { data: persisted, error } = await supabase
    .from("intraday_alerts")
    .upsert(rows, { onConflict: "user_id,symbol,signal_id,poll_cycle_timestamp" })
    .select("id, symbol, score");

  if (error) {
    console.error("[intraday-scan] could not persist alerts:", error);
    return false;
  }

  // Notification sending is deliberately synchronous and inline here rather
  // than a new cron: Vercel's Hobby plan caps scheduled jobs at two per
  // project and both are already spent (docs/THIRD_PARTY_LIMITS.md), so
  // dispatch has to ride the same request that just persisted the alert.
  // Best-effort — a notification failure must not turn a successful scan
  // into a failed one; dispatch already logs its own outcomes.
  const bySymbol = new Map(alerts.map((a) => [a.symbol, a]));
  const highConfidence = (persisted ?? []).filter((row) => row.score >= HIGH_CONFIDENCE_SCORE);
  await Promise.all(
    highConfidence.map((row) => {
      const source = bySymbol.get(row.symbol);
      const stopLoss = source?.invalidation;
      const takeProfit = source?.continuationPlan.firstTarget;
      if (!source || stopLoss == null || takeProfit == null) return Promise.resolve();
      return dispatchNotification(supabase as unknown as DispatchSupabase, userId, userEmail, {
        symbol: row.symbol,
        direction: DIRECTION_TO_SIGNAL_TYPE[source.direction] as "bullish" | "bearish",
        score: row.score,
        entry: source.move.current,
        stopLoss,
        takeProfit,
        confidence: source.confidence,
      }).catch((err) => {
        console.error("[intraday-scan] notification dispatch failed:", err);
      });
    }),
  );

  return true;
}

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
  lastAlerts: PriorAlert[],
  now: Date,
): Promise<SymbolInput | null> {
  const { symbol, kind } = entry;
  const assetClass = kind === "crypto" ? "crypto" : "us_equity";

  // Crypto never closes. Equities do, and when they're closed there's no
  // fresher data to wait for — the scan runs on the most recent session's
  // bars instead of refusing to run at all (see pickSessionBars below).
  const marketClosed = assetClass === "us_equity" && equitySession(now) === "closed";

  // Crypto has no feed delay. Free IEX stock data can't serve the most recent
  // ~15 minutes, and asking for it returns an empty tail rather than an error —
  // which would look like a symbol that stopped trading.
  const end =
    assetClass === "crypto" || !provider.isLive ? null : new Date(Date.now() - 16 * 60 * 1000);

  // A closed market can mean a weekend, or a holiday sitting right next to
  // one, so the minute-bar lookback is widened to find the last session that
  // actually traded. Alpaca pages newest-first and drops the oldest bars past
  // `limit`, so widening this never costs the recent data the live path needs.
  const minuteLookbackDays = marketClosed ? 6 : 2;

  try {
    const [minuteBars, baselineBars, dailyBars] = await Promise.all([
      provider.fetchBars(symbol, "1Min", daysAgo(minuteLookbackDays), end, assetClass, 2000),
      provider.fetchBars(symbol, "5Min", daysAgo(BASELINE_DAYS), end, assetClass, 5000),
      provider.fetchBars(symbol, "1Day", daysAgo(DAILY_ATR_DAYS), end, assetClass, 200),
    ]);

    const sessionBars = pickSessionBars(minuteBars, baselineBars, todayEt, marketClosed);
    if (sessionBars.bars.length === 0) return null;

    const last = sessionBars.bars[sessionBars.bars.length - 1];

    return {
      symbol,
      kind,
      bars: sessionBars.bars,
      barIntervalMinutes: sessionBars.intervalMinutes,
      prevClose: previousClose(dailyBars, sessionBars.sessionDate),
      quote: { price: last.c, at: last.t },
      // The baseline must cover exactly the window today's bars cover, not the
      // window the wall clock covers. The free IEX feed can't serve the most
      // recent ~15 minutes, so today's cumulative volume stops there while a
      // baseline measured to `now` kept counting — which made every symbol read
      // roughly 0.5x normal through the morning and suppressed the alerts this
      // scanner exists to produce. Measure the baseline to the last bar we
      // actually received, against the same session the bars came from.
      volumeBaseline: volumeBaseline(
        baselineBars,
        etParts(new Date(last.t)).minutes,
        sessionBars.sessionDate,
      ),
      dailyAtr: dailyBars.length > 2 ? atr(dailyBars.slice(-20), 14) : null,
      // The volume half of the platform-wide liquidity floor, read off the
      // daily bars already fetched above for the ATR — see lib/scan/liquidity.ts.
      avgDailyVolume: readLiquidity(dailyBars)?.avgVolume ?? null,
      lastAlerts,
      marketClosed,
    };
  } catch {
    return null;
  }
}

/**
 * Session bars at the best resolution available.
 *
 * Minute bars for today are preferred. When the feed returns none for today —
 * which happens on a thinly-traded name, or when the delayed window swallows a
 * short session — the five-minute series is used instead, and the caller is
 * told which, because a signal derived from five-minute bars can miss a move
 * that reverses inside one.
 *
 * When the market is closed and nothing has printed today at all (before the
 * open, over a weekend, or on a holiday), there is no "today" to fall back
 * within — the most recent session that actually traded is used instead, so a
 * closed market shows the last real move rather than nothing. `sessionDate`
 * always names which Eastern session the returned bars belong to, so callers
 * measuring "today's" volume or reference price against the right day.
 */
function pickSessionBars(
  minuteBars: Bar[],
  fallbackBars: Bar[],
  todayEt: string,
  marketClosed: boolean,
): { bars: Bar[]; intervalMinutes: number; sessionDate: string } {
  const minute = barsForSession(minuteBars, todayEt);
  if (minute.length > 0) return { bars: minute, intervalMinutes: 1, sessionDate: todayEt };

  const fiveMin = barsForSession(fallbackBars, todayEt);
  if (fiveMin.length > 0) return { bars: fiveMin, intervalMinutes: 5, sessionDate: todayEt };

  if (!marketClosed) return { bars: [], intervalMinutes: 1, sessionDate: todayEt };

  const staleDate = latestSessionDate(minuteBars) ?? latestSessionDate(fallbackBars);
  if (!staleDate || staleDate === todayEt) {
    return { bars: [], intervalMinutes: 1, sessionDate: todayEt };
  }

  const staleMinute = barsForSession(minuteBars, staleDate);
  if (staleMinute.length > 0) return { bars: staleMinute, intervalMinutes: 1, sessionDate: staleDate };

  return { bars: barsForSession(fallbackBars, staleDate), intervalMinutes: 5, sessionDate: staleDate };
}

/** The most recent Eastern calendar date any bar belongs to, or null if none. */
function latestSessionDate(bars: Bar[]): string | null {
  let latest: string | null = null;
  for (const bar of bars) {
    if (Number.isNaN(Date.parse(bar.t))) continue;
    const date = etDateKey(new Date(bar.t));
    if (latest === null || date > latest) latest = date;
  }
  return latest;
}

/** The last daily close before `sessionEt`. Null when the history doesn't reach it. */
function previousClose(dailyBars: Bar[], sessionEt: string): number | null {
  for (let i = dailyBars.length - 1; i >= 0; i--) {
    const bar = dailyBars[i];
    if (Number.isNaN(Date.parse(bar.t))) continue;
    if (etDateKey(new Date(bar.t)) >= sessionEt) continue;
    return bar.c > 0 ? bar.c : null;
  }
  return null;
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

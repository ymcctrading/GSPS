/**
 * Gann's exit rules for a position the platform is managing now, paper or live
 * (2026-09-28, project owner: "switch on Gann's exits").
 *
 * `lib/gann/exitRules.ts#readGannExit` holds the rules; the replay walks them
 * over history. This module supplies the same inputs for a position held today,
 * so the live and paper exit managers apply the rule the replay measured:
 *
 * - **Completed daily sessions only.** Today's session is still forming, and
 *   Gann's rules read closes. Bars dated today (ET) are dropped.
 * - **The crossed level** for the hold test is the old top (bottom) the entry
 *   crossed: Gann's buying point computed on the sessions before the entry
 *   day, which is exactly how the replay arms (`selectGannEntry`). A double or
 *   triple bottom crosses nothing, so it has no hold test, only its stop.
 * - **Shares outstanding** (D2) is the stored count, when there is one.
 *
 * Daily bars are cached per symbol per ET day, because the exit managers run
 * on every order poll and daily sessions only change once a day. A failed read
 * returns null: the caller keeps the stop already resting, which never loosens.
 *
 * Three-question basis: see `lib/gann/exitRules.ts` (Gann Tier A; no
 * periodicity claim; Cause and Effect and Rhythm). This module adds no rule.
 */

import type { Bar } from "@/lib/types";
import { monthlyWithCurrent } from "@/lib/gann/leadership";
import { getMarketDataProvider } from "@/lib/data/provider";
import { assertLiveMarketData } from "@/lib/data/feed-mode";
import { alpacaConfigured, fetchNews, isCryptoSymbol } from "@/lib/data/alpaca";
import { readBadNews, type BadNewsReading } from "@/lib/gann/badNews";
import { getInstrumentReference } from "@/lib/data/instrumentReference";
import { restsWithoutCrossing } from "@/lib/gann/entryKind";
import { readGannExit, type ExitReading, type GannExitReading } from "@/lib/gann/exitRules";
import { INTRADAY_WINDOW_BARS, SESSION_CLOSE_EXIT, readIntradayExit, regularSessionBars, sessionCloseDue } from "@/lib/gann/intradayExit";
import { intradayPoint } from "@/lib/gann/pointScale";
import { atr } from "@/lib/analysis/pivots";
import { etDateKey } from "@/lib/market/session";
import { entryChart, gannEntryOf, monthlyChartFrom, trendsFromBars } from "@/lib/scan/entrySelection";
import { gannRebuy, rebuysOn, type GannRebuy } from "@/lib/gann/rebuy";
import { readGannTrend } from "@/lib/gann/trendStrength";
import type { ReversalCause } from "@/lib/gann/reverse";
import type { TradeStyle } from "@/lib/trade/tradeStyle";

/** About two years of sessions: enough for the weekly swing chart and the campaign ledger. */
const DAILY_LOOKBACK_DAYS = 730;

const cache = new Map<string, { day: string; bars: Bar[]; monthly: Bar[] }>();

export function resetGannExitCache(): void {
  cache.clear();
}

/** Completed daily sessions, and the monthly chart the entry's older levels come from (PLAN.md item 5, step 3). */
export async function completedDailyBars(symbol: string, now: Date): Promise<{ bars: Bar[]; monthly: Bar[] }> {
  const today = etDateKey(now);
  const hit = cache.get(symbol);
  if (hit && hit.day === today) return hit;
  const assetClass = isCryptoSymbol(symbol) ? "crypto" : "us_equity";
  const start = new Date(now.getTime() - DAILY_LOOKBACK_DAYS * 86_400_000);
  const provider = getMarketDataProvider();
  // A live position is never managed on synthetic bars; the broker's own
  // stop stays where it is.
  assertLiveMarketData(`read ${symbol.toUpperCase()}'s daily chart to manage its exit`, provider);
  const [bars, monthly] = await Promise.all([
    provider.fetchBars(symbol, "1Day", start, null, assetClass),
    provider.fetchBars(symbol, "1Month", monthlyChartFrom(start), null, assetClass),
  ]);
  const entry = { day: today, bars: bars.filter((b) => b.t.slice(0, 10) < today), monthly };
  cache.set(symbol, entry);
  return entry;
}

export interface LiveGannExitInput {
  symbol: string;
  side: "long" | "short";
  entryPrice: number;
  /** The protocol stop the trade was opened with (its distance is the risk unit). */
  initialStop: number;
  /** When the plan was opened (ISO). */
  openedAt: string;
  /** Best price seen since the fill. */
  best: number | null;
  /** The trade style the position is managed in (`lib/trade/tradeStyle.ts`). Default swing. */
  style?: TradeStyle;
  /** Intraday only: close what is left at the session's end (`positionExitStyle`). */
  closeAtSessionEnd?: boolean;
  now?: Date;
}

/**
 * The level a position's entry crossed, read from the same 52 weeks of daily
 * sessions, the same older levels and the same buying point the scan priced
 * the entry from (`entryChart`, `gannEntryOf`). Null when that buying
 * point is a double or triple bottom, which crosses nothing (its exit is the stop 3
 * points under it, as in the replay), or when the entry is not beyond the
 * level.
 */
export function entryCrossedLevel(
  side: "long" | "short",
  entryPrice: number,
  openedAt: string,
  daily: Bar[],
  monthly: Bar[] = [],
): number | null {
  const day = etDateKey(new Date(openedAt));
  const chart = entryChart(daily, monthly, day);
  // The trend as of the entry, so a short the scan armed as a crossing is not
  // rebuilt as a bear-market rally sale (A-ENTRY-18; item 6 second review F3).
  // Months before the entry's month, plus that month so far rolled from the
  // sessions before the entry: a monthly bar dated the 1st holds the whole
  // month, later sessions included (item 7 review M2).
  const priorDaily = daily.filter((b) => b.t.slice(0, 10) < day);
  const trends = trendsFromBars(priorDaily, monthly.length > 0 ? monthlyWithCurrent(monthly, priorDaily) : []);
  const trigger = gannEntryOf(chart.bars, chart.older, trends)(side === "long" ? "bullish" : "bearish");
  // A double or triple bottom, or a bottom that held, crossed nothing.
  if (!trigger || restsWithoutCrossing(trigger.kind)) return null;
  // The level only counts as crossed when the entry is actually beyond it.
  return (side === "long" ? entryPrice >= trigger.pivot.price : entryPrice <= trigger.pivot.price) ? trigger.pivot.price : null;
}

/** Pure part, testable without a data provider. */
export function readGannExitFromBars(
  input: LiveGannExitInput,
  daily: Bar[],
  sharesOutstanding: number | null,
  monthly: Bar[] = [],
): GannExitReading {
  const entryDate = etDateKey(new Date(input.openedAt));
  const crossed = entryCrossedLevel(input.side, input.entryPrice, input.openedAt, daily, monthly);
  return readGannExit(
    { side: input.side, entry: input.entryPrice, initialStop: input.initialStop, entryDate, crossedLevel: crossed, style: input.style ?? "swing" },
    daily,
    input.best,
    sharesOutstanding,
  );
}

/**
 * Calendar days of 15-minute bars read before an intraday fill: enough for
 * the replay's window (`INTRADAY_WINDOW_BARS`, 400 regular-session bars, about
 * 16 sessions at 26 a session) across a holiday weekend.
 */
const INTRADAY_LOOKBACK_DAYS = Math.ceil((INTRADAY_WINDOW_BARS / 26) * (7 / 5)) + 5;
const BAR_MS = 15 * 60_000;

/**
 * Pure part of the Intraday style's reading (`lib/gann/intradayExit.ts`):
 * the intraday point fixed at the fill from the bars closed by then (as the
 * intraday replay fixes it at entry, from every bar before the entry bar,
 * pre- and post-market prints included), then the stop and the hourly turn
 * walked on regular-session bars for a US equity, and the session close.
 * Null when there are no bars before the fill to scale the point from.
 */
export function readIntradayExitFromBars(
  input: Pick<LiveGannExitInput, "side" | "initialStop" | "openedAt" | "closeAtSessionEnd"> & { crypto?: boolean },
  bars: Bar[],
  daily: Bar[],
  now: Date,
): ExitReading | null {
  const filledAt = Date.parse(input.openedAt);
  const before = bars.filter((b) => Date.parse(b.t) + BAR_MS <= filledAt);
  if (before.length < 15 || daily.length < 15) return null;
  const point = intradayPoint(before[before.length - 1].c, atr(before.slice(-30), 14), atr(daily.slice(-30), 14));
  return readIntradayExit({
    side: input.side,
    initialStop: input.initialStop,
    filledAt: input.openedAt,
    point,
    bars: regularSessionBars(bars, input.crypto === true),
    now,
    closeAtSessionEnd: input.closeAtSessionEnd ?? false,
  });
}

/** The Intraday style's reading, on the closed 15-minute bars since a few weeks before the fill. */
async function readLiveIntradayExit(input: LiveGannExitInput, now: Date): Promise<ExitReading | null> {
  const crypto = isCryptoSymbol(input.symbol);
  const provider = getMarketDataProvider();
  assertLiveMarketData(`read ${input.symbol.toUpperCase()}'s session to manage its intraday exit`, provider);
  const start = new Date(Math.min(Date.parse(input.openedAt), now.getTime()) - INTRADAY_LOOKBACK_DAYS * 86_400_000);
  const [bars, { bars: daily }] = await Promise.all([
    provider.fetchBars(input.symbol, "15Min", start, null, crypto ? "crypto" : "us_equity"),
    completedDailyBars(input.symbol, now),
  ]);
  // Closed bars only: a bar is closed once its 15 minutes have passed.
  const closed = bars.filter((b) => Date.parse(b.t) + BAR_MS <= now.getTime());
  const prior = daily.filter((b) => b.t.slice(0, 10) < etDateKey(new Date(input.openedAt)));
  return readIntradayExitFromBars({ ...input, crypto }, closed, prior, now);
}

/**
 * The session close, read from the clock alone: due whatever the bars say, so
 * a failed or thin read at 3:54 PM never holds overnight a trade the ticket
 * said would close.
 */
function clockSessionClose(input: LiveGannExitInput, now: Date): ExitReading | null {
  if (!input.closeAtSessionEnd || isCryptoSymbol(input.symbol)) return null;
  if (!sessionCloseDue(now, new Date(input.openedAt))) return null;
  return { stop: input.initialStop, stopReason: "initial", exit: SESSION_CLOSE_EXIT };
}

export async function readLiveGannExit(input: LiveGannExitInput): Promise<ExitReading | null> {
  try {
    const now = input.now ?? new Date();
    if (input.style === "intraday") {
      try {
        return (await readLiveIntradayExit(input, now)) ?? clockSessionClose(input, now);
      } catch (err) {
        const close = clockSessionClose(input, now);
        if (close) return close;
        throw err;
      }
    }
    const [{ bars: daily, monthly }, ref] = await Promise.all([
      completedDailyBars(input.symbol, now),
      isCryptoSymbol(input.symbol) ? Promise.resolve(null) : getInstrumentReference(input.symbol),
    ]);
    if (daily.length < 10) return null;
    return readGannExitFromBars(input, daily, ref?.sharesOutstanding ?? null, monthly);
  } catch (err) {
    console.error(`gann-exit-live: ${input.symbol} — ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * Re-buy after a stop (A-PYRAMID-07, `lib/gann/rebuy.ts`), read on the
 * completed sessions when a live or paper trade leaves on a stop: the re-entry
 * the rules rest on the reaction, or null when the trend no longer runs the
 * trade's way, the stop doesn't re-buy, or the bars can't be read.
 */
export async function readLiveRebuy(input: {
  symbol: string;
  side: "long" | "short";
  cause: ReversalCause | null;
  extreme: number;
  entryPrice: number;
  now?: Date;
}): Promise<GannRebuy | null> {
  if (!rebuysOn(input.cause)) return null;
  try {
    const { bars: daily } = await completedDailyBars(input.symbol, input.now ?? new Date());
    if (daily.length < 10) return null;
    return gannRebuy({ side: input.side, extreme: input.extreme, trend: readGannTrend(daily).direction, entryPrice: input.entryPrice });
  } catch (err) {
    console.error(`gann-exit-live: re-buy ${input.symbol} — ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/** A week back is enough to reach the prior session across a weekend or holiday. */
const NEWS_LOOKBACK_DAYS = 7;
const ET_STAMP = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
/** A timestamp as New York "YYYY-MM-DD HH:MM". */
function etStamp(iso: string): string {
  const p = Object.fromEntries(ET_STAMP.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}
const newsCache = new Map<string, { day: string; reading: BadNewsReading | null }>();

/**
 * Cover shorts on bad news (A-EXIT-04, `lib/gann/badNews.ts`), read once per
 * symbol and New York day on the completed sessions and the symbol's news.
 * Null for a long, for crypto, without a news feed, or when either read fails: the offer
 * is a note, so a failed read only leaves it out.
 */
export async function readLiveBadNews(input: {
  symbol: string;
  side: "long" | "short";
  entryPrice: number;
  now?: Date;
}): Promise<BadNewsReading | null> {
  // Equities only: the window is read from the 4 PM New York close.
  if (input.side !== "short" || isCryptoSymbol(input.symbol) || !alpacaConfigured()) return null;
  const now = input.now ?? new Date();
  const day = etDateKey(now);
  const key = `${input.symbol.toUpperCase()}:${input.entryPrice}`;
  const hit = newsCache.get(key);
  if (hit && hit.day === day) return hit.reading;
  try {
    const { bars: daily } = await completedDailyBars(input.symbol, now);
    const news = await fetchNews(input.symbol, new Date(now.getTime() - NEWS_LOOKBACK_DAYS * 86_400_000));
    const reading = readBadNews({
      side: input.side,
      entryPrice: input.entryPrice,
      daily,
      news,
      etStamp: etStamp,
    });
    newsCache.set(key, { day, reading });
    return reading;
  } catch (err) {
    console.error(`gann-exit-live: bad news ${input.symbol} — ${err instanceof Error ? err.message : String(err)}`);
    // Read again tomorrow, not on every pass of today's.
    newsCache.set(key, { day, reading: null });
    return null;
  }
}

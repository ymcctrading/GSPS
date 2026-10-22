/**
 * GSPS — the completed daily sessions before an intraday session, read the
 * same way by the live intraday scan (`app/api/intraday-scan/route.ts`) and
 * the alert replay (`lib/backtest/replayIntradayAlerts.ts`).
 *
 * The prior close gates "Daily plan's level held" (the prior session must have
 * closed at or beyond the entry, W006 Rule 3(b)-(c)), and the completed
 * sessions feed the daily ATR, the liquidity floor and the prior session's
 * high and low the crossing alerts read. Gann reads closes that are made, so
 * only a daily bar that had ended before the session began counts.
 *
 * When a daily bar ends depends on the market:
 * - An equity's daily bar is stamped at the start of its New York date and
 *   ends at that date's close, so it is complete for every later New York
 *   session: key it by its New York date.
 * - A crypto daily bar is the UTC day (Alpaca and Binance both), stamped
 *   00:00 UTC, which is 7 or 8 PM the evening before in New York. Keyed by
 *   its New York date it reads as the day before the one it covers, so the
 *   bar still forming during today's New York session passed as "prior":
 *   the live scan's crypto prior close was the current price. Key it by its
 *   UTC date instead: the UTC day D ends at 00:00 UTC on D+1, before New
 *   York's midnight on D+1, so it is complete for New York session D+1 and
 *   every later one.
 *
 * The intraday session itself is always the New York date (`etDateKey`).
 *
 * Three questions: (1) Gann reads completed closes (W006 Rule 3; *Truth of
 * the Stock Tape*'s closing prices), and the live scan and the replay must
 * read the same ones. (2) No periodicity claim. (3) Correspondence: one
 * reading of "the session before" on both surfaces and in both markets.
 * Law of Creation: live scan ⊗ replay, the pair whose agreement makes the
 * measurement mean anything.
 */

import type { Bar } from "@/lib/types";
import { etDateKey } from "@/lib/market/session";

/** Daily bars the live scan reads per symbol (its fetch limit), and so the replay too. */
export const INTRADAY_DAILY_BAR_LIMIT = 300;

/**
 * Raw daily bars the live scan fetches so that, once the forming bar (and,
 * for crypto after 8 PM New York time, the next UTC day's) is set aside, a
 * full `INTRADAY_DAILY_BAR_LIMIT` completed sessions remain, as the replay
 * reads them.
 */
export const INTRADAY_DAILY_FETCH_LIMIT = INTRADAY_DAILY_BAR_LIMIT + 2;

/** The date a daily bar's trading belongs to, by market (see the header). */
export function dailyBarDate(bar: Bar, crypto: boolean): string | null {
  const ms = Date.parse(bar.t);
  if (Number.isNaN(ms)) return null;
  return crypto ? new Date(ms).toISOString().slice(0, 10) : etDateKey(new Date(ms));
}

/**
 * The daily bars complete before New York session `sessionEt`, oldest first,
 * at most `INTRADAY_DAILY_BAR_LIMIT` of them, from `fromDate` (a date key,
 * inclusive) when given.
 */
export function completedDailyBars(
  dailyBars: readonly Bar[],
  sessionEt: string,
  crypto: boolean,
  fromDate?: string,
): Bar[] {
  const out: Bar[] = [];
  for (const bar of dailyBars) {
    const date = dailyBarDate(bar, crypto);
    if (date === null || date >= sessionEt) continue;
    if (fromDate !== undefined && date < fromDate) continue;
    out.push(bar);
  }
  return out.length > INTRADAY_DAILY_BAR_LIMIT ? out.slice(-INTRADAY_DAILY_BAR_LIMIT) : out;
}

/** The last completed daily close before `sessionEt`; null when the history doesn't reach it. */
export function priorDailyClose(dailyBars: readonly Bar[], sessionEt: string, crypto: boolean): number | null {
  const done = completedDailyBars(dailyBars, sessionEt, crypto);
  const last = done[done.length - 1];
  return last && last.c > 0 ? last.c : null;
}

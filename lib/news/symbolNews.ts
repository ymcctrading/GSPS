/**
 * GSPS — news on the symbol page (Q3 item 6, `docs/Q3_PLAN.md`).
 *
 * Each headline is shown beside the close of the session it fell on, and that
 * session's change from the close before it, so a reader sees how the market
 * answered the news rather than a reading of the news itself.
 *
 * Three-question basis:
 * 1. Gann: he read the market's response to news, not the news: tops come on
 *    bullish news and bottoms on bearish, because the news is already
 *    discounted (*Commodities* p. 8; W006 p. 14). `lib/gann/badNews.ts` reads
 *    it the same way. So the page pairs each item with the close it met, and
 *    gives no sentiment score: Gann gives none, and one would be platform
 *    substance with no source. Nothing here reaches a score, plan or order.
 * 2. Cycles: no periodicity claim; Dewey does not apply.
 * 3. Hermetic: Cause and Effect, the news as the cause and the close as the
 *    market's effect, set side by side; Polarity is left to the reader (the
 *    worst news can be the bottom). Law of Creation: headline ⊗ close is a
 *    creation only when the two are read together (the response to the news);
 *    shown apart they are a mixture, which is why each row carries both.
 *
 * Session rule, the one `badNews.ts` uses: an equity item published at or
 * after the close (4 PM New York time, 1 PM on an early close) belongs to the
 * next session, and a weekend or
 * holiday item to the first session after it (the first completed bar on or
 * after its date; a session missing from the feed carries its items to the
 * next one it has). A crypto item belongs to its UTC day, the day a crypto
 * daily bar covers (`lib/scanner/priorClose.ts#dailyBarDate`). An item whose
 * session has not closed yet is shown without a close.
 *
 * Every string here is plain, names no method and claims nothing about what a
 * headline will do: this module ships to the browser through the page's types.
 */

import type { Bar } from "@/lib/types";
import { dailyBarDate } from "@/lib/scanner/priorClose";

export interface NewsHeadline {
  /** ISO timestamp the item was published. */
  createdAt: string;
  headline: string;
  /** The publisher, when the feed names one. */
  source?: string;
  /** Link to the article, when the feed gives one (https only). */
  url?: string;
}

export interface NewsRow extends NewsHeadline {
  /** The session the item fell on (YYYY-MM-DD), or null while it is still open. */
  session: string | null;
  /** That session's close, or null while it is still open. */
  close: number | null;
  /** Its change from the session before, in price and percent; null without one. */
  change: number | null;
  changePct: number | null;
}

/** The `/api/news` response. */
export interface SymbolNews {
  symbol: string;
  /** ISO time the headlines were read. */
  readAt: string;
  items: NewsRow[];
}

/** "YYYY-MM-DD" plus one calendar day. */
function nextDate(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * The first date whose session an item can fall on: its New York date, or the
 * day after when published at or after the 4 PM close (equities), or its UTC
 * date (crypto). `etStamp` maps a timestamp to New York "YYYY-MM-DD HH:MM";
 * `closeAt` gives a date's close as "HH:MM" (default 4 PM).
 */
export function earliestSession(
  createdAt: string,
  crypto: boolean,
  etStamp: (iso: string) => string,
  closeAt: (date: string) => string = () => "16:00",
): string | null {
  const ms = Date.parse(createdAt);
  if (Number.isNaN(ms)) return null;
  if (crypto) return new Date(ms).toISOString().slice(0, 10);
  const stamp = etStamp(createdAt);
  const date = stamp.slice(0, 10);
  return stamp.slice(11) >= closeAt(date) ? nextDate(date) : date;
}

/**
 * Pair each headline, newest first, with the completed session it fell on.
 * `daily` is completed daily bars only, oldest first.
 */
export function pairNewsWithSessions(input: {
  news: readonly NewsHeadline[];
  daily: readonly Bar[];
  crypto: boolean;
  etStamp: (iso: string) => string;
  closeAt?: (date: string) => string;
}): NewsRow[] {
  const { news, daily, crypto, etStamp, closeAt } = input;
  const sessions: { date: string; close: number }[] = [];
  for (const bar of daily) {
    const date = dailyBarDate(bar, crypto);
    if (date !== null && Number.isFinite(bar.c))
      sessions.push({ date, close: bar.c });
  }
  sessions.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return [...news]
    .filter((n) => !Number.isNaN(Date.parse(n.createdAt)))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .map((n) => {
      const from = earliestSession(n.createdAt, crypto, etStamp, closeAt);
      const i = from === null ? -1 : sessions.findIndex((s) => s.date >= from);
      if (i < 0)
        return {
          ...n,
          session: null,
          close: null,
          change: null,
          changePct: null,
        };
      const s = sessions[i];
      const prior = i > 0 ? sessions[i - 1].close : null;
      const change = prior !== null ? s.close - prior : null;
      const changePct =
        prior !== null && prior !== 0 ? (s.close - prior) / prior : null;
      return { ...n, session: s.date, close: s.close, change, changePct };
    });
}

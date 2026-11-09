/**
 * Cover shorts on bad news (A-EXIT-04, built 2026-10-22; owner: "Build these").
 *
 * Source, Tier A, Gann's own text: before Christmas 1927 his trader covers
 * his shorts on bad news, "This was the time to cash in" (*Tunnel Thru the
 * Air* p.223). What makes news bad Gann answers from the market, not the
 * headline: the market "bottoms on bearish news" because the news is already
 * discounted (*Commodities* p.8), and "when news is the worst, it is time to
 * buy stocks" (W006 p.14). So the news counts as bad when price fell on it:
 * a news item on the symbol after the prior session and through the last
 * completed one, and that session closed under the prior close.
 *
 * Where it acts: an offer in the exit notes for an open short that shows a
 * profit (he cashed in a winning line), on the paper and broker exit managers.
 * Nothing closes on its own: the headline feed is a third party's and the
 * reading of it is ours. The replay holds no news history, so it is not
 * measured (labelled gap).
 *
 * Engineering choices, labelled: the news window (from the prior session's
 * 4 PM New York close through the last session's, so news after one
 * close counts on the next session) and "a profit" as price under the entry.
 *
 * Three-question basis:
 * 1. Gann: as cited, Tier A (Tunnel, Commodities, W006).
 * 2. Cycles: no periodicity claim; Dewey does not apply.
 * 3. Hermetic: Polarity (the worst news is the bottom of the decline) and
 *    Cause and Effect (the news is the cause the decline was discounting).
 */
import type { Bar } from "@/lib/types";

export interface NewsItem {
  /** ISO timestamp the item was published. */
  createdAt: string;
  headline: string;
}

export interface BadNewsReading {
  /** The session the news fell on (YYYY-MM-DD, New York). */
  session: string;
  headline: string;
  close: number;
  priorClose: number;
}

/**
 * The bad news a short should cover on, or null. `daily` is completed sessions
 * only; `etStamp` maps a timestamp to its New York "YYYY-MM-DD HH:MM".
 */
export function readBadNews(input: {
  side: "long" | "short";
  entryPrice: number;
  daily: Bar[];
  news: NewsItem[];
  etStamp: (iso: string) => string;
}): BadNewsReading | null {
  const { side, entryPrice, daily, news, etStamp } = input;
  if (side !== "short" || daily.length < 2 || news.length === 0) return null;
  const last = daily[daily.length - 1];
  const prior = daily[daily.length - 2];
  if (!(last.c < prior.c)) return null; // price did not fall on it
  if (!(last.c < entryPrice)) return null; // nothing to cash in
  const from = `${prior.t.slice(0, 10)} 16:00`;
  const to = `${last.t.slice(0, 10)} 16:00`;
  const item = news
    .filter((n) => {
      const stamp = etStamp(n.createdAt);
      return stamp >= from && stamp <= to;
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
  if (!item) return null;
  return { session: last.t.slice(0, 10), headline: item.headline, close: last.c, priorClose: prior.c };
}

/** The exit note offering the cover. */
export function badNewsOffer(symbol: string, r: BadNewsReading): string {
  return `${symbol}: news on ${r.session} ("${r.headline}") and the close fell to ${r.close.toFixed(2)} from ${r.priorClose.toFixed(2)}. The market bottoms on bad news, so this short is offered for cover while it shows a profit. Nothing was closed.`;
}

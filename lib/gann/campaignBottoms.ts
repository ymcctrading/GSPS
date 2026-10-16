/**
 * Gann's ladder of old campaign bottoms (A-LEVELS-03; W006 pp.23-24). After
 * the 1929 top, each time the averages broke the previous bear campaign's
 * bottom by 3 points, he looked to the next older one: the 1923-24 lows, then
 * 1921, 1917, 1914, 1907, 1903-04 and 1896. Context only for now: the card
 * and `contextFactors`; it joins plan levels in a later, measured step.
 *
 * The reading, on completed months and sessions only:
 * - the campaign bottoms: the monthly chart's pivot lows (the lowest month of
 *   the seven around it), over the `OLDER_LEVELS_YEARS` calendar years
 *   before the session on both surfaces, newest first;
 * - broken: a later month's close (or a completed session's close this
 *   month) under the bottom by Gann's 3 points, price-scaled;
 * - the next support: walking newest first, the first bottom not broken.
 *
 * Engineering choices, labelled: "campaign bottom" as a monthly pivot low of
 * strength 3 (Gann names them by example only; FL7 a). Not `majorPivots`'
 * top quarter by prominence, which `readMonthCounts` uses: that cut depends
 * on how many swings the span holds and drops the newest, smaller campaign
 * when two larger ones sit behind it. The 10-year span (the feed
 * reaches about 2016-17, so Gann's 33-year ladder is cut short by data).
 *
 * Three-question basis:
 * 1. Gann: W006 pp.23-24 (class A).
 * 2. Cycles: no periodicity claim; Dewey does not apply.
 * 3. Hermetic: Rhythm (each campaign's low is a step the next decline is
 *    measured against) and Correspondence (the same ladder on any stock).
 */
import type { Bar } from "@/lib/types";
import { findPivots } from "@/lib/analysis/pivots";
import { OLDER_LEVELS_YEARS } from "@/lib/gann/entryTrigger";
import { etDateKey } from "@/lib/market/session";
import { beyondByThreePoints } from "@/lib/gann/pointScale";

export interface CampaignBottom {
  /** The pivot month, "YYYY-MM". */
  month: string;
  price: number;
  broken: boolean;
}

export interface CampaignBottomLadder {
  /** Newest first. */
  bottoms: CampaignBottom[];
  /** The bottom Gann would look to next, or null when every one is broken or none is below price. */
  nextSupport: CampaignBottom | null;
}

export function readCampaignBottoms(monthly: Bar[] | null | undefined, daily: Bar[], asOf: Date): CampaignBottomLadder | null {
  if (!monthly || monthly.length < 24) return null;
  const today = etDateKey(asOf);
  const thisMonth = today.slice(0, 7);
  const first = `${Number(today.slice(0, 4)) - OLDER_LEVELS_YEARS}-01`;
  const months = monthly.filter((b) => b.t.slice(0, 7) >= first && b.t.slice(0, 7) < thisMonth);
  const sessionsThisMonth = daily.filter((b) => {
    const k = etDateKey(new Date(b.t));
    return k < today && k.slice(0, 7) === thisMonth;
  });
  const lows = findPivots(months, 3).filter((p) => p.kind === "low");
  const bottoms: CampaignBottom[] = lows
    .map((p) => {
      const line = beyondByThreePoints(p.price, -1);
      const later = months.slice(p.index + 1).some((b) => b.c < line) || sessionsThisMonth.some((b) => b.c < line);
      return { month: p.bar.t.slice(0, 7), price: p.price, broken: later };
    })
    .reverse();
  // An older bottom above a broken one is broken by the same close, so the
  // first unbroken bottom, newest first, is always below every broken one.
  return { bottoms, nextSupport: bottoms.find((b) => !b.broken) ?? null };
}

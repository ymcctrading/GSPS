/**
 * The first rally out of a bear market (A-TIME-03), context only.
 *
 * Source (class A, *New Stock Trend Detector*, 1936; W006 pp. 14, 43): the
 * Averages ran from the 8 July 1932 low of 40½ to 81 on 8 September, "a fast
 * advance on short covering"; the market could not go higher in the third
 * month and the volume was large, so it was only a first rally (p. 14). From
 * April 1930 to July 1932 no rally lasted over two months, so a real bull
 * market had to rise three full months or more (p. 43). Gann gives the bull
 * side only; this module reads only the bull side.
 *
 * How GSPS reads it, on the stock's own monthly chart:
 * - The bear market's low is the latest month whose low is the lowest of the
 *   12 months to it (at least `MIN_BEAR_MONTHS` before it in the record),
 *   and a later month has gone above that month's high.
 * - The advance's top is the highest month after the low; its length is the
 *   number of months from the low month to the top month (July to September
 *   1932 is two).
 * - A top three or more months after the low is a bull campaign. A top inside
 *   two months, once the third month has come without a new high, is a first
 *   rally if the advance's months carried large volume, and a stall if not.
 *   Before the third month the reading waits.
 *
 * Engineering choices, labelled as such:
 * - "Large volume" is the advance's average monthly volume at least
 *   `VOLUME_CLIMAX_THRESHOLD` (1.5×) the average of the six months before the
 *   low, the ratio the volume-climax rule already uses. Gann gives no ratio.
 * - The low has to lie within the last 36 months (the 3 years campaigns seldom
 *   outlast, `campaignLedger.ts`), so an old low does not label today.
 *
 * Context only: shown on the card and measured as two factors; never a score,
 * gate, plan, stop, target or order.
 *
 * Three-question basis:
 * 1. Source: as above, class A.
 * 2. Cycles: a duration rule (two months against three), not a periodicity
 *    claim; Dewey's checklist does not apply. It is measured in the replay
 *    before it could act.
 * 3. Hermetic: Rhythm. A bear market's rallies run their two months and swing
 *    back; a bull market shows itself by breaking that rhythm and rising into
 *    the third month. Cause and Effect fits the volume: a rally on large volume
 *    that cannot go on has spent its cause (short covering).
 */
import type { Bar } from "@/lib/types";
import { VOLUME_CLIMAX_THRESHOLD } from "@/lib/gann/volumeClimax";

/** A bull market rises this many full months or more (W006 p. 43). */
export const BULL_CAMPAIGN_MONTHS = 3;
/** Months the low must be the lowest of. */
export const BEAR_LOW_MONTHS = 12;
/** Months of record needed before the low. */
export const MIN_BEAR_MONTHS = 6;
/** The low must lie within this many months of now. */
export const FIRST_RALLY_LOOKBACK_MONTHS = 36;
/** Months before the low the advance's volume is compared with. */
export const PRIOR_VOLUME_MONTHS = 6;

export type FirstRallyState = "early" | "firstRally" | "stalled" | "bullCampaign";

export interface FirstRallyReading {
  /** The bear market's low month (YYYY-MM). */
  lowMonth: string;
  /** The advance's highest month so far (YYYY-MM). */
  topMonth: string;
  /** Months from the low month to the top month. */
  advanceMonths: number;
  /** The advance's average monthly volume over the six months before the low. */
  volumeRatio: number | null;
  state: FirstRallyState;
}

const mean = (xs: number[]) => (xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function readFirstRally(monthly: Bar[]): FirstRallyReading | null {
  const end = monthly.length - 1;
  let low = -1;
  for (let i = end; i >= Math.max(MIN_BEAR_MONTHS, end - FIRST_RALLY_LOOKBACK_MONTHS); i--) {
    const from = Math.max(0, i - BEAR_LOW_MONTHS);
    if (monthly.slice(from, i).every((b) => b.l > monthly[i].l)) {
      low = i;
      break;
    }
  }
  if (low < 0) return null;
  let top = -1;
  for (let i = low + 1; i <= end; i++) if (monthly[i].h > monthly[low].h && (top < 0 || monthly[i].h > monthly[top].h)) top = i;
  if (top < 0) return null;

  const advanceMonths = top - low;
  const before = mean(monthly.slice(Math.max(0, low - PRIOR_VOLUME_MONTHS), low).map((b) => b.v));
  const during = mean(monthly.slice(low + 1, top + 1).map((b) => b.v));
  const volumeRatio = before > 0 ? during / before : null;

  let state: FirstRallyState;
  if (advanceMonths >= BULL_CAMPAIGN_MONTHS) state = "bullCampaign";
  else if (end - low < BULL_CAMPAIGN_MONTHS) state = "early";
  else state = volumeRatio !== null && volumeRatio >= VOLUME_CLIMAX_THRESHOLD ? "firstRally" : "stalled";

  return {
    lowMonth: monthly[low].t.slice(0, 7),
    topMonth: monthly[top].t.slice(0, 7),
    advanceMonths,
    volumeRatio,
    state,
  };
}

const CONTEXT = "Shown for context; it does not change the setup.";

export function describeFirstRally(r: FirstRallyReading): string | null {
  if (r.state === "firstRally") {
    return `The advance from the ${r.lowMonth} low topped in ${r.topMonth} and could not go higher in its third month, on volume ${r.volumeRatio!.toFixed(1)}× the months before: only a first rally out of a bear market. ${CONTEXT}`;
  }
  if (r.state === "bullCampaign") {
    return `The advance from the ${r.lowMonth} low has risen ${r.advanceMonths} months, past the two months a bear market's rallies run: a bull campaign. ${CONTEXT}`;
  }
  return null;
}

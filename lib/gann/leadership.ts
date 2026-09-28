/**
 * Gann's early and late leaders, and the first-year-high filter (parity
 * roadmap G25; *Wall Street Stock Selector* Ch. VII, Tier A).
 *
 * - "Stocks that bottom first top first." Leadership rotates by section: the
 *   early leaders bottom before the market and top before it; late movers
 *   bottom late and top late, with sharp tops and fast collapses.
 * - A stock must cross the high of the first year of the bull campaign (by
 *   the 3-point allowance) before it can lead a later section.
 * - The last campaign's leader rarely leads the next one.
 *
 * The reading compares the stock's lowest low (and highest high) over the last
 * `LOOKBACK` sessions with the market's (the S&P 500 ETF, SPY, as the
 * market), and carries the campaign ledger's first-year-high test.
 *
 * Engineering choices, labelled as such: the market proxy is SPY; "first" and
 * "late" need a gap of at least `LEAD_DAYS` calendar days between the two
 * extremes; the lookback is a year of sessions.
 *
 * Three-question basis:
 * 1. Gann: as cited, Tier A.
 * 2. Cycles: rotation of leadership within a campaign; no period is claimed,
 *    so Dewey does not apply. Cross-series clustering (Dewey's item) is what
 *    the comparison with the market measures, informally.
 * 3. Hermetic: Rhythm (the order of turning repeats: first down, first up)
 *    and Correspondence (the stock's cycle read against the market's).
 */

import type { Bar } from "@/lib/types";
import { buildCampaignLedger, type CampaignLedger } from "@/lib/gann/campaignLedger";

export const LOOKBACK = 250;
export const LEAD_DAYS = 10;

export interface LeadershipReading {
  /** The stock's low came before the market's by LEAD_DAYS or more: an early leader. */
  bottomedFirst: boolean;
  bottomedLate: boolean;
  /** The stock's high came before the market's: it may top first. */
  toppedFirst: boolean;
  /** The campaign's first-year high, when a bull campaign has run a year. */
  firstYearHighCrossed: boolean | null;
}

function extremeDate(bars: Bar[], kind: "low" | "high"): number {
  let idx = 0;
  for (let i = 1; i < bars.length; i++) {
    if (kind === "low" ? bars[i].l < bars[idx].l : bars[i].h > bars[idx].h) idx = i;
  }
  return Date.parse(bars[idx].t);
}

export function readLeadership(
  daily: Bar[],
  market: Bar[] | null,
  campaign?: CampaignLedger | null,
): LeadershipReading | null {
  if (daily.length < 60) return null;
  const ledger = campaign === undefined ? buildCampaignLedger(daily) : campaign;
  const firstYearHighCrossed = ledger?.firstYearHigh ? ledger.firstYearHigh.crossed : null;
  if (!market || market.length < 60) {
    return { bottomedFirst: false, bottomedLate: false, toppedFirst: false, firstYearHighCrossed };
  }
  const end = daily[daily.length - 1].t;
  const mkt = market.filter((b) => b.t <= end).slice(-LOOKBACK);
  const stk = daily.slice(-LOOKBACK);
  const lead = LEAD_DAYS * 86_400_000;
  const sLow = extremeDate(stk, "low");
  const mLow = extremeDate(mkt, "low");
  const sHigh = extremeDate(stk, "high");
  const mHigh = extremeDate(mkt, "high");
  return {
    bottomedFirst: mLow - sLow >= lead,
    bottomedLate: sLow - mLow >= lead,
    toppedFirst: mHigh - sHigh >= lead,
    firstYearHighCrossed,
  };
}

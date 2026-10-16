/**
 * Gann's shares-per-point efficiency at tops (parity roadmap G7, the Master
 * Course's own metric; Tier A).
 *
 * Gann measured how many shares traded for each point the market gained, leg
 * by leg. Into the 1937 top the figure nearly doubled against the prior leg:
 * "increased volume on a smaller gain was an indication that the market was
 * nearing top." It is a top rule; the text gives no mirror for bottoms (its
 * bottom rule is volume drying up, `volumeClimax.ts`), so none is invented.
 *
 * The reading: volume per point of price gain over the current up section of
 * the weekly (7-day) swing chart, from its bottom to the latest session,
 * against the prior completed up section, bottom to top, in a bull campaign. A ratio at or above
 * `TOP_WARNING_RATIO` near the campaign high is the warning.
 *
 * Engineering choices, labelled as such: "nearly double" is 1.70×, the lower
 * of Gann's two worked cases (Master Course Ch.12: 151,197 shares a point
 * against 88,860 into 1937, 1.70×; W006 pp.43-45: 1933 against 1929, 1.93×).
 * It was 1.8×, which missed his own 1937 case (item 8 map FV11); "near the
 * high" is within 3% of the highest high since the campaign began.
 *
 * Three-question basis:
 * 1. Gann: as cited, Tier A.
 * 2. Cycles: no periodicity claim; Dewey does not apply.
 * 3. Hermetic: Cause and Effect (more effort for less result means the cause
 *    of the advance, fresh demand, is being used up).
 */

import type { Bar } from "@/lib/types";
import { buildCampaignLedger, type CampaignLedger } from "@/lib/gann/campaignLedger";
import { WEEKLY_SWING_CHART, walkSwingChart } from "@/lib/gann/swingChart";

export const TOP_WARNING_RATIO = 1.7;
export const NEAR_HIGH_PCT = 3;

export interface SharesPerPointReading {
  currentPerPoint: number;
  priorPerPoint: number;
  ratio: number;
  nearHigh: boolean;
  topWarning: boolean;
}

function perPoint(bars: Bar[], from: number, to: number): number | null {
  if (to <= from) return null;
  const points = bars[to].c - bars[from].c;
  if (!(points > 0)) return null;
  let vol = 0;
  for (let i = from + 1; i <= to; i++) vol += bars[i].v;
  return vol / points;
}

export function readSharesPerPoint(daily: Bar[], campaign?: CampaignLedger | null): SharesPerPointReading | null {
  const ledger = campaign === undefined ? buildCampaignLedger(daily) : campaign;
  if (!ledger || ledger.trend !== "bullish") return null;
  // Sections of the weekly chart (item 8 map FV11): Gann compares moves of
  // weeks and months (1937 against 1934-36; 1933 against 1929), not 3-day legs.
  const walk = walkSwingChart(daily, WEEKLY_SWING_CHART);
  const pivots = walk.pivots;
  if (walk.swingDirection !== "bullish" || pivots.length < 3) return null;
  const currentStart = pivots[pivots.length - 1];
  const priorTop = pivots[pivots.length - 2];
  const priorBottom = pivots[pivots.length - 3];
  if (currentStart.kind !== "bottom" || priorTop.kind !== "top" || priorBottom.kind !== "bottom") return null;
  const priorPerPoint = perPoint(daily, priorBottom.index, priorTop.index);
  const currentPerPoint = perPoint(daily, currentStart.index, daily.length - 1);
  if (priorPerPoint === null || currentPerPoint === null) return null;
  const startIdx = daily.findIndex((b) => b.t.slice(0, 10) >= ledger.campaignStartDate);
  const high = Math.max(...daily.slice(Math.max(0, startIdx)).map((b) => b.h));
  const nearHigh = ((high - daily[daily.length - 1].c) / high) * 100 <= NEAR_HIGH_PCT;
  const ratio = currentPerPoint / priorPerPoint;
  return { currentPerPoint, priorPerPoint, ratio, nearHigh, topWarning: nearHigh && ratio >= TOP_WARNING_RATIO };
}

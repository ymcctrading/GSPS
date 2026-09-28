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
 * The reading: volume per point of price gain over the current up leg of the
 * weekly campaign against the prior completed up leg. A ratio at or above
 * `TOP_WARNING_RATIO` near the campaign high is the warning.
 *
 * Engineering choices, labelled as such: "nearly double" is 1.8×; "near the
 * high" is within 3% of the highest high since the campaign began; the current
 * leg is measured from its start to the latest session.
 *
 * Three-question basis:
 * 1. Gann: as cited, Tier A.
 * 2. Cycles: no periodicity claim; Dewey does not apply.
 * 3. Hermetic: Cause and Effect (more effort for less result means the cause
 *    of the advance, fresh demand, is being used up).
 */

import type { Bar } from "@/lib/types";
import { buildCampaignLedger, type CampaignLedger } from "@/lib/gann/campaignLedger";

export const TOP_WARNING_RATIO = 1.8;
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
  const ups = ledger.legs.filter((l) => l.direction === "up");
  if (ups.length === 0) return null;
  const prior = ups[ups.length - 1];
  const priorPerPoint = perPoint(daily, prior.fromIndex, prior.toIndex);
  // The current up leg starts where the last completed leg ended.
  const lastLeg = ledger.legs[ledger.legs.length - 1];
  const currentStart = lastLeg.direction === "down" ? lastLeg.toIndex : prior.toIndex;
  const currentPerPoint = perPoint(daily, currentStart, daily.length - 1);
  if (priorPerPoint === null || currentPerPoint === null || currentStart === prior.fromIndex) return null;
  const startIdx = daily.findIndex((b) => b.t.slice(0, 10) >= ledger.campaignStartDate);
  const high = Math.max(...daily.slice(Math.max(0, startIdx)).map((b) => b.h));
  const nearHigh = ((high - daily[daily.length - 1].c) / high) * 100 <= NEAR_HIGH_PCT;
  const ratio = currentPerPoint / priorPerPoint;
  return { currentPerPoint, priorPerPoint, ratio, nearHigh, topWarning: nearHigh && ratio >= TOP_WARNING_RATIO };
}

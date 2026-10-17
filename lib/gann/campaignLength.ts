/**
 * Bull-campaign length as a repeat (A-TIME-07), context and research only.
 *
 * Source (class A, *New Stock Trend Detector*, 1936, Ch. III "History
 * Repeats", p. 12; long-book notes W011, and W006 pp. 9-12): the 1921-29 bull
 * campaign ran 97 months to the September 3, 1929 top, which the book sets
 * against the 99 months (8 years 3 months) of the March 1861 to July 1869
 * campaign. History repeats as time: a campaign's length is a guide to the
 * next one's. The feature map marks this rule research-only and
 * confluence-only, so nothing here feeds a score, a gate, a plan or an order.
 *
 * How GSPS reads it: on the market's monthly chart (SPY), the same two-bar
 * monthly chart that dates the bull and bear markets (`leadership.ts`,
 * `marketBullStart` and its mirror `marketBearStart`). A completed bull
 * campaign runs from its lowest month before the chart turned up to its
 * highest month before the chart turned down. The latest completed one's
 * length, in calendar months, is projected from the current campaign's start
 * as the month a repeat would top in.
 *
 * Engineering choices, labelled as such:
 * - A campaign counts as completed only when the chart turned down after it,
 *   and its start is used only when a bear trend came before it, so a
 *   campaign cut off by the start of the feed is not measured.
 * - "At the prior length" is within 2 months of it, the gap between the
 *   book's own pair (97 and 99 months).
 * - Data limit: the feed holds only a few campaigns, so the reading often
 *   says there is no prior campaign.
 *
 * Three-question basis:
 * 1. Source: as above, class A.
 * 2. Cycles: a recurrence claim resting on two campaigns. Dewey's repetition
 *    count is two and constancy of period is not shown; no item is cleared,
 *    which is why it is measured as a context factor and never gates.
 * 3. Hermetic: Rhythm, the swing into a bull campaign running about as long
 *    as the last before it swings back.
 */
import type { Bar } from "@/lib/types";
import { marketBullStart, MONTHLY_REACTION_CHART } from "@/lib/gann/leadership";
import { walkSwingChart } from "@/lib/gann/swingChart";

/** Within this many months of the prior campaign's length (97 against 99). */
export const CAMPAIGN_REPEAT_MONTHS = 2;

export interface BullCampaign {
  /** The campaign's lowest month (YYYY-MM). */
  start: string;
  /** Its highest month (YYYY-MM). */
  top: string;
  months: number;
}

export interface CampaignLengthReading {
  /** Completed bull campaigns on the market's monthly chart, oldest first. */
  completed: BullCampaign[];
  /** The latest completed campaign, or null: "no prior campaign" in the feed. */
  prior: BullCampaign | null;
  /** The current bull campaign's start, and months run so far; null while the market's chart is down. */
  current: { start: string; months: number } | null;
  /** The month a campaign as long as the prior one would top in. */
  projectedTop: string | null;
  /** The current campaign has run within `CAMPAIGN_REPEAT_MONTHS` of the prior one's length. */
  atPriorLength: boolean;
}

const monthIndex = (ym: string) => Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1;
const monthKey = (i: number) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;

export function completedBullCampaigns(marketMonthly: Bar[]): BullCampaign[] {
  if (marketMonthly.length < 6) return [];
  const walk = walkSwingChart(marketMonthly, MONTHLY_REACTION_CHART);
  const changes = walk.trendChanges;
  // Trend changes alternate; the last one set the current trend.
  const dirAt = (k: number) => ((changes.length - 1 - k) % 2 === 0 ? walk.trend : walk.trend === "bullish" ? "bearish" : "bullish");
  const out: BullCampaign[] = [];
  for (let k = 1; k + 1 < changes.length; k++) {
    if (dirAt(k) !== "bullish") continue;
    let lo = changes[k - 1];
    for (let i = changes[k - 1]; i <= changes[k]; i++) if (marketMonthly[i].l < marketMonthly[lo].l) lo = i;
    let hi = changes[k];
    for (let i = changes[k]; i <= changes[k + 1]; i++) if (marketMonthly[i].h > marketMonthly[hi].h) hi = i;
    const start = marketMonthly[lo].t.slice(0, 7);
    const top = marketMonthly[hi].t.slice(0, 7);
    out.push({ start, top, months: monthIndex(top) - monthIndex(start) });
  }
  return out;
}

export function readCampaignLength(marketMonthly: Bar[], asOf: Date): CampaignLengthReading | null {
  if (marketMonthly.length < 6) return null;
  const completed = completedBullCampaigns(marketMonthly);
  const prior = completed.length > 0 ? completed[completed.length - 1] : null;
  const startMonth = marketBullStart(marketMonthly);
  const now = asOf.getUTCFullYear() * 12 + asOf.getUTCMonth();
  const current = startMonth ? { start: startMonth, months: now - monthIndex(startMonth) } : null;
  const projectedTop = current && prior ? monthKey(monthIndex(current.start) + prior.months) : null;
  return {
    completed,
    prior,
    current,
    projectedTop,
    atPriorLength: current !== null && prior !== null && Math.abs(current.months - prior.months) <= CAMPAIGN_REPEAT_MONTHS,
  };
}

export function describeCampaignLength(r: CampaignLengthReading): string | null {
  if (!r.current) return null;
  if (!r.prior) return `The market's bull campaign from ${r.current.start} has run ${r.current.months} months; no earlier completed campaign is in the record to compare it with. Shown for context; it does not change the setup.`;
  return `The market's bull campaign from ${r.current.start} has run ${r.current.months} months; the last one (${r.prior.start} to ${r.prior.top}) ran ${r.prior.months}, so a repeat would top around ${r.projectedTop}${r.atPriorLength ? ", and it is there now" : ""}. Shown for context; it does not change the setup.`;
}

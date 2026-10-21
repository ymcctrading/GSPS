/**
 * Gann's resistance levels from the major ranges (score pillar P5's percentage
 * check, 2026-10-21).
 *
 * What Gann divides, in his order of importance (Master Course Ch. 9,
 * "Resistance Levels", PDF 263-264, July 1939; *How to Make Profits in
 * Commodities* pp. 34-35, the same text): first the extreme ("life") range,
 * from the highest high to the lowest low; second the highest price itself;
 * third each campaign that ran a year or more. Each is divided by 8 and by 3
 * ("Range of Fluctuations": divide by 8 and by 3; "Highest Selling Price" the
 * same). "The most important point is the 50% of the extreme range"
 * (Commodities p. 35), and the Master Course's buying rule reads "Best
 * buying point: 50% of the highest price. Next: 50% of the range" (PDF 11).
 * Among the divisions, Ch. 6's "on a basis of 100" tiers (PDF 185): ½ first,
 * then ¼ and ¾, then ⅓ and ⅔, then the eighths (`retracement.ts`'s ranks).
 *
 * This replaced, for the score, the divisions of the last daily swing (4-bar
 * pivots, `computeRetracementLevels`). That swing is a minor move, usually
 * narrower than twice the 3-point allowance, so one of its twelve divisions
 * sat inside the allowance on 64-74% of random-walk readings whichever side
 * was asked. Gann's half-way point "of the last move" (Ch. 7's extra rule) is
 * a stop rule, not one of the resistance levels he ranks; the swing levels
 * stay on the card.
 *
 * Engineering choices, labelled: the "life range" is the record both surfaces
 * hold (the monthly level chart, `OLDER_LEVELS_YEARS` back, with the 52 weeks
 * of sessions), not the stock's whole history; a campaign is a move between
 * two monthly swing extremes (a month higher or lower than
 * `CAMPAIGN_PIVOT_MONTHS` on each side) a year or more apart, and only the
 * latest such campaign is divided; the 1/16 points, which Gann keeps for
 * "great ranges" (Ch. 9, PDF 268), are left out.
 *
 * Three questions, as AGENTS.md asks:
 * 1. Gann: Master Course Ch. 6 and Ch. 9 (Tier A), Commodities pp. 32-37
 *    (Tier A), *45 Years in Wall Street* Ch. IV (50% first).
 * 2. Cycles: no periodicity claim; Dewey's checklist does not apply. The
 *    campaign's "year or more" is Gann's own span, not a fitted period.
 * 3. Hermetic: Correspondence (the same divisions of the greater range and of
 *    the lesser, the highest price and the campaign) and Polarity (a level
 *    is support below price and resistance above it, one line for both).
 */

import type { Bar } from "@/lib/types";
import { findPivots } from "@/lib/analysis/pivots";
import { levelRole, type LevelRole } from "@/lib/analysis/levelRole";
import { levelBandPct } from "@/lib/scoring/proximity";
import { FIRST_TIER_RANK, HALF_RANK, SECOND_TIER_RANK, THIRD_TIER_RANK } from "@/lib/gann/retracement";

/** Gann's "each campaign of one year or more" (Master Course Ch. 9, PDF 264). */
export const MIN_CAMPAIGN_MONTHS = 12;
/** Engineering choice: a monthly swing extreme is higher (lower) than this many months each side. */
export const CAMPAIGN_PIVOT_MONTHS = 3;

export type RangeBasis = "extremeRange" | "highestPrice" | "campaign";

/** Gann's order of importance among the things divided (Ch. 9, PDF 264). */
export const BASIS_RANK: Record<RangeBasis, number> = { extremeRange: 1, highestPrice: 2, campaign: 3 };

const BASIS_LABEL: Record<RangeBasis, string> = {
  extremeRange: "of the extreme range",
  highestPrice: "of the highest price",
  campaign: "of the last campaign",
};

/** The eighths and the thirds, with Ch. 6's ranks. */
const DIVISIONS: { fraction: number; label: string; importance: number }[] = [
  { fraction: 1 / 8, label: "1/8", importance: THIRD_TIER_RANK },
  { fraction: 1 / 4, label: "1/4", importance: FIRST_TIER_RANK },
  { fraction: 1 / 3, label: "1/3", importance: SECOND_TIER_RANK },
  { fraction: 3 / 8, label: "3/8", importance: THIRD_TIER_RANK },
  { fraction: 1 / 2, label: "1/2", importance: HALF_RANK },
  { fraction: 5 / 8, label: "5/8", importance: THIRD_TIER_RANK },
  { fraction: 2 / 3, label: "2/3", importance: SECOND_TIER_RANK },
  { fraction: 3 / 4, label: "3/4", importance: FIRST_TIER_RANK },
  { fraction: 7 / 8, label: "7/8", importance: THIRD_TIER_RANK },
];

export interface RangeDivisionLevel {
  price: number;
  /** For example "1/2 of the extreme range (12.00-48.00)". */
  label: string;
  basis: RangeBasis;
  /** Ch. 6's rank of the division (1 = 50%). */
  importance: number;
}

export interface RangeDivisionMatch extends RangeDivisionLevel {
  role: LevelRole;
  distancePct: number;
}

const fmt = (n: number) => n.toFixed(2);

/**
 * The latest campaign of a year or more on the monthly chart: two alternating
 * monthly swing extremes `MIN_CAMPAIGN_MONTHS` or more apart. Null when none.
 */
export function latestCampaign(monthly: Bar[]): { low: number; high: number } | null {
  const pivots = findPivots(monthly, CAMPAIGN_PIVOT_MONTHS).sort((a, b) => a.index - b.index);
  const alt: typeof pivots = [];
  for (const p of pivots) {
    const last = alt[alt.length - 1];
    if (last && last.kind === p.kind) {
      if (p.kind === "high" ? p.price > last.price : p.price < last.price) alt[alt.length - 1] = p;
    } else alt.push(p);
  }
  for (let i = alt.length - 1; i > 0; i--) {
    const a = alt[i - 1];
    const b = alt[i];
    if (a.kind !== b.kind && b.index - a.index >= MIN_CAMPAIGN_MONTHS) {
      const low = Math.min(a.price, b.price);
      const high = Math.max(a.price, b.price);
      return high > low ? { low, high } : null;
    }
  }
  return null;
}

/**
 * Gann's divisions of the extreme range, the highest price and the latest
 * campaign of a year or more, from the record (`record`: the monthly level
 * chart and the daily sessions; `monthly`: the monthly chart the campaigns are
 * read from). Ordered by Gann's basis rank, then the division's rank.
 */
export function majorRangeDivisions(record: Bar[], monthly: Bar[]): RangeDivisionLevel[] {
  if (record.length === 0) return [];
  let low = Infinity;
  let high = -Infinity;
  for (const b of record) {
    if (b.l < low) low = b.l;
    if (b.h > high) high = b.h;
  }
  if (!(low > 0) || !(high > low)) return [];
  const bases: { basis: RangeBasis; from: number; to: number }[] = [
    { basis: "extremeRange", from: low, to: high },
    { basis: "highestPrice", from: 0, to: high },
  ];
  const campaign = latestCampaign(monthly);
  if (campaign) bases.push({ basis: "campaign", from: campaign.low, to: campaign.high });
  const out: RangeDivisionLevel[] = [];
  for (const { basis, from, to } of bases) {
    const span = basis === "highestPrice" ? fmt(to) : `${fmt(from)}-${fmt(to)}`;
    for (const d of DIVISIONS) {
      out.push({
        price: from + (to - from) * d.fraction,
        label: `${d.label} ${BASIS_LABEL[basis]} (${span})`,
        basis,
        importance: d.importance,
      });
    }
  }
  return out.sort((a, b) => BASIS_RANK[a.basis] - BASIS_RANK[b.basis] || a.importance - b.importance);
}

/**
 * The division in `role` at `price` (support below, resistance above: a level
 * is support while price is above it and resistance while price is below it)
 * inside Gann's 3-point allowance at the level (`levelBandPct`). The nearest
 * wins; at an equal distance, the more important basis, then division.
 */
export function rangeDivisionMatch(
  levels: RangeDivisionLevel[],
  price: number,
  role: LevelRole,
): RangeDivisionMatch | null {
  if (!(price > 0)) return null;
  let best: RangeDivisionMatch | null = null;
  for (const l of levels) {
    if (levelRole(price, l.price) !== role) continue;
    const distancePct = (Math.abs(price - l.price) / price) * 100;
    if (distancePct > levelBandPct(l.price)) continue;
    if (!best || distancePct < best.distancePct - 1e-9) best = { ...l, role, distancePct };
  }
  return best;
}

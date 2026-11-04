/**
 * The Scanner's "Groups" tab (Q3 item 3, `docs/Q3_PLAN.md`): the industry
 * groups ranked by their standing, each opening to its stocks in rank order,
 * and the breadth of the universe read from the same positions.
 *
 * Gann ranks the groups before the stocks in them, and buys the strongest
 * stocks of the strongest groups and sells the weakest of the weakest (*Truth
 * of the Stock Tape* Ch. XVI-XVII, "Position of groups"; *Wall Street Stock
 * Selector* Ch. VII). That rank is already built and read by the score
 * (`lib/gann/universeStrength.ts`); this module only shows it. Every figure
 * comes from `readUniverseRank` itself, called once per stock, so the page
 * and the score can never read a different standing (cross-platform rule).
 * Nothing here says a stock passes a score check: since #559 a long gets
 * credit for its rank only when `longMayLead` holds (`lib/gann/leadership.ts`),
 * so the page shows positions and ranks, never the score's flags.
 *
 * Breadth is read as Gann reads a market's position, against the 50% of its
 * range, his most important point ("the most important point is the 50% of
 * the extreme range", *Commodities* pp. 34-35; 45 Years Ch. IV): how many
 * stocks close in the upper half of their twelve months' range, and how many
 * ranked groups have their median stock there (a close exactly at the half
 * counts as the upper half). Every universe stock the month read is counted,
 * grouped or not. Not an advance/decline indicator,
 * which has no source in his work. The twelve months are the rank's own
 * window (`STRENGTH_MONTHS`), an engineering reading of "the year".
 *
 * A stock's own figures are the month's stored reading (`stockMonthly` null),
 * while the score reads the stock's own monthly bars: a price adjustment
 * published after the month was first read can move its universe figure by a
 * few hundredths. The group standing reads the stored month alone on both, so
 * it never differs.
 *
 * Display only: no score, level, verdict or `STRATEGY_VERSION` reads it.
 * User-facing text built from it names no method (confidential-sources rule).
 *
 * Three questions: 1. As cited, Tier A. 2. No period is claimed; Dewey does
 * not apply. 3. Correspondence (each stock read by the measure the score
 * reads it by, on every surface) and Polarity (the strongest and the weakest
 * as the two ends of one list). Law of Creation: group ⊗ stock is a creation,
 * the stock's standing read inside its group's, which re-enters as the group
 * rank the score already reads; this page adds no third of its own.
 */

import { etDateKey } from "@/lib/market/session";
import { INDUSTRY_GROUPS, type IndustryGroup } from "@/lib/gann/industryGroups";
import { rankedClass, readUniverseRank, type UniverseStrength } from "@/lib/gann/universeStrength";

export interface GroupMember {
  symbol: string;
  /** Where its last monthly close sits in its twelve months' range, 0 (the low) to 1 (the high). */
  position: number;
  /** Its standing among the whole universe, 0 (the weakest) to 1 (the strongest). */
  universePercentile: number;
  /** 1 for the strongest of the group; equal positions share a rank. */
  groupRank: number;
}

export interface GroupStanding {
  key: string;
  label: string;
  /** The group's standing: its members' median position ranked among the universe, 0 to 1. Null when too few members were read. */
  standing: number | null;
  /** The median member's position in its range, 0 to 1. */
  medianPosition: number;
  /** Strongest first. */
  members: GroupMember[];
}

export interface Breadth {
  stocks: number;
  /** Every universe stock read this month, grouped or not; those closing in the upper half of their twelve months' range. */
  stocksUpperHalf: number;
  /** Ranked groups only; those whose median stock closes in the upper half. */
  groups: number;
  groupsUpperHalf: number;
}

export interface GroupView {
  /** The New York month the reading is made in (YYYY-MM), from the months closed before it. */
  month: string;
  /** Ranked groups, strongest first; then any group too few of whose members read to rank, by name. */
  groups: GroupStanding[];
  breadth: Breadth;
}

function median(sorted: number[]): number {
  const mid = sorted.length / 2;
  return sorted.length % 2 ? sorted[Math.floor(mid)] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * The groups and their stocks as the rank reads them in the month of `asOf`.
 * Null when the universe has no reading for that month, or no stock reads in
 * it (a thin live read, which the rank leaves unread too).
 */
export function readGroupView(
  universe: UniverseStrength | null | undefined,
  asOf: Date,
  groups: Map<string, IndustryGroup> = INDUSTRY_GROUPS,
): GroupView | null {
  if (!universe) return null;
  const month = etDateKey(asOf).slice(0, 7);
  const entry = universe.get(month);
  if (!entry) return null;

  const byGroup = new Map<string, { label: string; standing: number | null; members: Omit<GroupMember, "groupRank">[] }>();
  for (const [symbol, group] of groups) {
    // A second share class is its company, listed once (as the rank counts it).
    if (rankedClass(symbol) !== symbol) continue;
    const r = readUniverseRank(symbol, null, asOf, universe, groups);
    if (!r) continue;
    let g = byGroup.get(group.key);
    if (!g) {
      g = { label: group.label, standing: null, members: [] };
      byGroup.set(group.key, g);
    }
    if (r.group) g.standing = r.group.groupPercentile;
    g.members.push({ symbol, position: r.position, universePercentile: r.percentile });
  }

  if (byGroup.size === 0) return null;

  const out: GroupStanding[] = [];
  let groupsRanked = 0;
  let groupsUpperHalf = 0;
  for (const [key, g] of byGroup) {
    const sorted = [...g.members].sort((a, b) => b.position - a.position || (a.symbol < b.symbol ? -1 : 1));
    const members: GroupMember[] = [];
    for (let i = 0; i < sorted.length; i++) {
      const tied = i > 0 && sorted[i].position === sorted[i - 1].position;
      members.push({ ...sorted[i], groupRank: tied ? members[i - 1].groupRank : i + 1 });
    }
    const medianPosition = median(members.map((m) => m.position).sort((a, b) => a - b));
    if (g.standing !== null) {
      groupsRanked += 1;
      if (medianPosition >= 0.5) groupsUpperHalf += 1;
    }
    out.push({ key, label: g.label, standing: g.standing, medianPosition, members });
  }
  // The universe's own reading of every stock, as the rank holds it (one class per company).
  const positions = [...entry.bySymbol.values()];
  const stocks = positions.length;
  const stocksUpperHalf = positions.filter((p) => p >= 0.5).length;
  out.sort((a, b) => {
    if (a.standing === null || b.standing === null) {
      if (a.standing !== b.standing) return a.standing === null ? 1 : -1;
      return a.label < b.label ? -1 : 1;
    }
    return b.standing - a.standing || b.medianPosition - a.medianPosition || (a.label < b.label ? -1 : 1);
  });

  return { month, groups: out, breadth: { stocks, stocksUpperHalf, groups: groupsRanked, groupsUpperHalf } };
}

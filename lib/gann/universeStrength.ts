/**
 * S6, Gann's relative strength rank: "How to Select the Commodity that will
 * Lead a Decline or an Advance" (*How to Make Profits in Commodities* p. 20,
 * Tier A) is to compare the monthly highs and lows of every market and take
 * the strongest for a long, the weakest for a short; one that fails to cross
 * its former tops shows relative weakness (p. 47). On stocks it is "buy the
 * strongest stocks in the group and sell short the ones in the weakest
 * position", and "those selling at the highest levels are in the strongest
 * position" (*Wall Street Stock Selector* Ch. VII, the Sugar and Tobacco
 * reviews; *Truth of the Stock Tape* Ch. XVII-XIX). P3(c) of the score reads
 * it (`lib/scoring/pillars.ts`), and the lists order by it
 * (`selectionStrength`).
 *
 * The rank (2026-10-21) replaces the stand-in of 2026-10-20, which compared a
 * stock with SPY alone ("stronger than the average", a lower bar than Gann's
 * "among the strongest"). Here every stock of the scan universe
 * (`LARGE_CAP_UNIVERSE`, the list the market scan rotates through) is placed
 * by where its last monthly close sits in its last `STRENGTH_MONTHS` months of
 * highs and lows, and a stock is ranked among them. It is strongest in the top
 * `STRONGEST_FRACTION` and weakest in the bottom one.
 *
 * Why this gives one answer on every surface, which the stand-in's header
 * named as the obstacle: the peers are a fixed list, not the symbols a scan or
 * a replay run was handed, and the rank reads completed months only. The month
 * in progress is not a monthly high or low yet. So the market scan, the symbol
 * page and the replay all read the same peers on the same months, and the
 * replay reads them as they stood before each session (`buildUniverseStrength`
 * keys every reading by the month it is read in).
 *
 * Engineering choices, labelled: the peers are today's universe list carried
 * back in time (a survivorship effect the replay inherits); position in the
 * year's range is how the highs and lows are compared, as the stand-in did;
 * a quarter is "the strongest" (Gann names the strongest few, never a
 * fraction); a reading needs `MIN_PEERS` peers, so a fetch that came back thin
 * reads nothing rather than a rank among a handful. US equities only: crypto
 * has no peer list here.
 *
 * Within the group (S4), 2026-10-21: the same reading ranks the stock among
 * the universe stocks of its industry group (`industryGroups.ts`, SEC's
 * industry codes), by the same measure: among a quarter of its members
 * (`groupTopCount`, at least one), and only in a group that is not itself in
 * the universe's weakest quarter (strongest, for a short), since Gann ranks
 * the groups first (review of #388). P3(c) passes on either rank, as its design reads S6 ("among the strongest of its group or
 * of the scanned universe").
 *
 * Three questions: 1. S6 and S4, Tier A, as cited. 2. No period is claimed, so
 * Dewey does not apply; the rank is a cross-series comparison of where each
 * series stands, his clustering item read across stocks rather than through
 * time. 3. Polarity (the strongest long and the weakest short are one rank
 * read from both ends) and Correspondence (each stock read by the same
 * measure as every other).
 */

import type { Bar } from "@/lib/types";
import { etDateKey } from "@/lib/market/session";
import { INDUSTRY_GROUPS, groupOf, type IndustryGroup } from "@/lib/gann/industryGroups";

export const STRENGTH_MONTHS = 12;
/** "Among the strongest": the top quarter (bottom quarter for the weakest). */
export const STRONGEST_FRACTION = 0.25;
/** Fewer peers than this and no rank is read. */
export const MIN_PEERS = 100;

/** Where the last close sits in the last STRENGTH_MONTHS months' range, 0 (the low) to 1 (the high). */
export function strengthPosition(closedMonths: Bar[]): number | null {
  if (closedMonths.length < STRENGTH_MONTHS) return null;
  const win = closedMonths.slice(-STRENGTH_MONTHS);
  let hi = -Infinity;
  let lo = Infinity;
  for (const b of win) {
    if (b.h > hi) hi = b.h;
    if (b.l < lo) lo = b.l;
  }
  const close = win[win.length - 1].c;
  return hi > lo ? (close - lo) / (hi - lo) : null;
}

/** The universe's positions as read in one month: from the months before it. */
export interface StrengthMonth {
  /** Ascending, for the rank. */
  sorted: number[];
  bySymbol: Map<string, number>;
}

/** Keyed by the month a reading is made in (YYYY-MM). */
export type UniverseStrength = Map<string, StrengthMonth>;

function nextMonth(month: string): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

/**
 * Every month's universe positions, from each symbol's monthly bars. The
 * reading in month M uses the STRENGTH_MONTHS months that closed before M.
 * Bars from the month a fetch ran in are in progress and are never the last
 * closed month of any reading, since that reading's month has not begun.
 */
export function buildUniverseStrength(universeMonthly: Map<string, Bar[]>): UniverseStrength {
  const out: UniverseStrength = new Map();
  for (const [symbol, raw] of universeMonthly) {
    const bars = [...raw].sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));
    for (let i = STRENGTH_MONTHS - 1; i < bars.length; i++) {
      const pos = strengthPosition(bars.slice(i - STRENGTH_MONTHS + 1, i + 1));
      if (pos === null) continue;
      const month = nextMonth(bars[i].t.slice(0, 7));
      let entry = out.get(month);
      if (!entry) {
        entry = { sorted: [], bySymbol: new Map() };
        out.set(month, entry);
      }
      entry.bySymbol.set(symbol.toUpperCase(), pos);
    }
  }
  for (const entry of out.values()) entry.sorted = [...entry.bySymbol.values()].sort((a, b) => a - b);
  return out;
}

function lowerBound(xs: number[], v: number): number {
  let lo = 0;
  let hi = xs.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] < v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function upperBound(xs: number[], v: number): number {
  let lo = 0;
  let hi = xs.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export interface GroupRankReading {
  /** The group's key (SIC industry or major group) and a label for display. */
  key: string;
  label: string;
  percentile: number;
  peers: number;
  /** The group's own standing: its members' median position ranked in the universe, 0 to 1. */
  groupPercentile: number;
  /**
   * Among the strongest `groupTopCount` of the group (fewer peers above it
   * than that), and the group itself not in the universe's weakest quarter.
   * Gann ranks the groups first (TST Ch. XVI-XVII); reading a group's standing
   * as its members' median position, and "not in the weakest quarter" as the
   * gate, are engineering choices held for the owner.
   */
  strongest: boolean;
  /** The mirror: among the weakest of a group not in the universe's strongest quarter. */
  weakest: boolean;
}

/**
 * How many of a group's members make its strongest (or weakest) quarter: a
 * quarter of them, rounded down, and at least one. With 4 peers (5 members)
 * that is the one strongest; a percentile cut let the top 2 of 5 through
 * (review of #388). An engineering reading of "the strongest", held for the
 * owner like the universe's quarter.
 */
export function groupTopCount(members: number): number {
  return Math.max(1, Math.floor(members * STRONGEST_FRACTION));
}

export interface UniverseRankReading {
  /** The stock's own position in its year's range. */
  position: number;
  /** Its rank among the peers, 0 (the weakest) to 1 (the strongest); ties count half. */
  percentile: number;
  peers: number;
  strongest: boolean;
  weakest: boolean;
  /**
   * Its rank within its industry group (S4, `industryGroups.ts`), by the same
   * measure and cutoff. Null when it has no group or fewer than
   * `MIN_GROUP_PEERS` group peers were read this month.
   */
  group: GroupRankReading | null;
}

/** Fewer group peers than this and no group rank is read. */
export const MIN_GROUP_PEERS = 4;

/** Each month's sorted positions per group, built once per group map, month and group. */
const groupSorted = new WeakMap<Map<string, IndustryGroup>, WeakMap<StrengthMonth, Map<string, number[]>>>();

function groupPositions(entry: StrengthMonth, key: string, groups: Map<string, IndustryGroup>): number[] {
  let byMonth = groupSorted.get(groups);
  if (!byMonth) {
    byMonth = new WeakMap();
    groupSorted.set(groups, byMonth);
  }
  let byGroup = byMonth.get(entry);
  if (!byGroup) {
    byGroup = new Map();
    byMonth.set(entry, byGroup);
  }
  let sorted = byGroup.get(key);
  if (!sorted) {
    sorted = [];
    for (const [sym, pos] of entry.bySymbol) if (groups.get(sym)?.key === key) sorted.push(pos);
    sorted.sort((a, b) => a - b);
    byGroup.set(key, sorted);
  }
  return sorted;
}

/** The rank of `position` among `sorted`, leaving out the stock's own reading `own`. */
function rankAmong(sorted: number[], position: number, own: number | undefined): { percentile: number; peers: number } {
  let n = sorted.length;
  let below = lowerBound(sorted, position);
  let atOrBelow = upperBound(sorted, position);
  if (own !== undefined) {
    n -= 1;
    if (own < position) {
      below -= 1;
      atOrBelow -= 1;
    } else if (own === position) {
      atOrBelow -= 1;
    }
  }
  return { percentile: n > 0 ? (below + (atOrBelow - below) / 2) / n : 0, peers: n };
}

/**
 * The stock's rank among the universe in the month of `asOf`. Its position is
 * read from its own months closed before that month (any symbol can be
 * ranked, in the universe or not), else from the universe's reading of it.
 * The stock itself is never one of its own peers.
 */
export function readUniverseRank(
  symbol: string,
  stockMonthly: Bar[] | null | undefined,
  asOf: Date,
  universe: UniverseStrength | null | undefined,
  /** The group map; the checked-in SEC map unless a test hands its own. */
  groups: Map<string, IndustryGroup> = INDUSTRY_GROUPS,
): UniverseRankReading | null {
  if (!universe) return null;
  // The New York month, so a scan after 8 PM ET on a month's last day reads that month, as the replay's session does.
  const month = etDateKey(asOf).slice(0, 7);
  const entry = universe.get(month);
  if (!entry) return null;
  const sym = symbol.toUpperCase();
  const own = entry.bySymbol.get(sym);
  const position = stockMonthly ? strengthPosition(stockMonthly.filter((b) => b.t.slice(0, 7) < month)) : own ?? null;
  if (position === null || position === undefined) return null;
  const { percentile, peers } = rankAmong(entry.sorted, position, own);
  if (peers < MIN_PEERS) return null;
  const g = groupOf(sym, groups);
  let group: GroupRankReading | null = null;
  if (g) {
    const sorted = groupPositions(entry, g.key, groups);
    const r = rankAmong(sorted, position, own);
    if (r.peers >= MIN_GROUP_PEERS) {
      // Peers strictly above and below the stock, leaving its own reading out.
      let above = sorted.length - upperBound(sorted, position);
      let below = lowerBound(sorted, position);
      if (own !== undefined && own > position) above -= 1;
      if (own !== undefined && own < position) below -= 1;
      const top = groupTopCount(r.peers + 1);
      // Gann ranks the groups before the stocks in them (TST Ch. XVI, "Position of
      // groups"; Ch. XVII, "always sell the weak stocks and buy the strong ones"):
      // the best stock of a weak group is not a strong stock. The group's median
      // position, ranked among the universe, is its standing.
      // The median averages the two middle readings of an even group, so the long and short gates mirror.
      const mid = sorted.length / 2;
      const median = sorted.length % 2 ? sorted[Math.floor(mid)] : (sorted[mid - 1] + sorted[mid]) / 2;
      const groupPercentile = rankAmong(entry.sorted, median, undefined).percentile;
      group = {
        key: g.key,
        label: g.label,
        ...r,
        groupPercentile,
        strongest: above < top && groupPercentile > STRONGEST_FRACTION,
        weakest: below < top && groupPercentile < 1 - STRONGEST_FRACTION,
      };
    }
  }
  return {
    position,
    percentile,
    peers,
    strongest: percentile >= 1 - STRONGEST_FRACTION,
    weakest: percentile <= STRONGEST_FRACTION,
    group,
  };
}

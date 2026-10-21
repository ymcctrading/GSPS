/**
 * The group map for Gann's relative strength rank within groups (S4: "buy the
 * strongest stocks in the group and sell short the ones in the weakest
 * position", *Wall Street Stock Selector* Ch. VII, the Sugar and Tobacco
 * reviews; *Truth of the Stock Tape* Ch. XVI-XIX, the Motors, Rubbers, Oils,
 * Coppers and Rails). Gann's groups are industries, so a stock's group is its
 * SEC industry code (SIC), fetched once and checked in
 * (`industryGroups.json`, `scripts/fetch-industry-groups.mjs`), the same map
 * on every surface.
 *
 * Engineering choices, labelled: the group is the SIC's three-digit industry
 * group (Motor Vehicles 371, Petroleum Refining 291) when at least
 * `MIN_GROUP_MEMBERS` universe stocks share it, else its two-digit major group
 * (Transportation Equipment 37), else none; a symbol SEC does not list has no
 * group. The universe is today's list, as the universe rank's is.
 *
 * Three questions: 1. S4, Tier A, as cited. 2. No period is claimed; Dewey
 * does not apply. 3. Correspondence (a stock read against those of its own
 * kind, as a commodity against commodities) and Polarity (the group's
 * strongest long, its weakest short).
 */

import data from "@/lib/gann/industryGroups.json";

export const MIN_GROUP_MEMBERS = 5;

export interface IndustryGroup {
  /** "371" (industry group) or "37" (major group). */
  key: string;
  /** SEC's description of one member's industry, for display. */
  label: string;
}

type SicMap = Record<string, { sic: string; description: string }>;

/** Each symbol's group, from a symbol-to-SIC map. */
export function buildGroupMap(sics: SicMap): Map<string, IndustryGroup> {
  const count = (len: number) => {
    const n = new Map<string, number>();
    for (const { sic } of Object.values(sics)) n.set(sic.slice(0, len), (n.get(sic.slice(0, len)) ?? 0) + 1);
    return n;
  };
  const three = count(3);
  const two = count(2);
  const out = new Map<string, IndustryGroup>();
  for (const [symbol, { sic, description }] of Object.entries(sics)) {
    const key = (three.get(sic.slice(0, 3)) ?? 0) >= MIN_GROUP_MEMBERS
      ? sic.slice(0, 3)
      : (two.get(sic.slice(0, 2)) ?? 0) >= MIN_GROUP_MEMBERS
        ? sic.slice(0, 2)
        : null;
    if (key) out.set(symbol.toUpperCase(), { key, label: description });
  }
  return out;
}

export const INDUSTRY_GROUPS: Map<string, IndustryGroup> = buildGroupMap((data as { groups: SicMap }).groups);

export function groupOf(symbol: string, groups: Map<string, IndustryGroup> = INDUSTRY_GROUPS): IndustryGroup | null {
  return groups.get(symbol.toUpperCase()) ?? null;
}

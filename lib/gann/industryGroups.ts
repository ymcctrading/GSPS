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
 * (Transportation Equipment 37) when at least `MIN_GROUP_MEMBERS` of the
 * stocks left over share that, else none; a symbol SEC does not list has no
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
  /** "SIC 371 (Motor Vehicles & Passenger Car Bodies)": the key and its members' commonest SEC description. */
  label: string;
}

type SicMap = Record<string, { sic: string; description: string }>;

/**
 * Each symbol's group, from a symbol-to-SIC map. The two-digit major group is
 * counted over the symbols left without a three-digit group, so every group
 * the map holds has at least `MIN_GROUP_MEMBERS` members (review of #388:
 * counting every symbol with the prefix left "groups" of one).
 */
export function buildGroupMap(sics: SicMap): Map<string, IndustryGroup> {
  const entries = Object.entries(sics);
  const tally = (keys: string[]) => {
    const n = new Map<string, number>();
    for (const k of keys) n.set(k, (n.get(k) ?? 0) + 1);
    return n;
  };
  const three = tally(entries.map(([, { sic }]) => sic.slice(0, 3)));
  const keyOf = new Map<string, string>();
  const left: [string, string][] = [];
  for (const [symbol, { sic }] of entries) {
    if ((three.get(sic.slice(0, 3)) ?? 0) >= MIN_GROUP_MEMBERS) keyOf.set(symbol, sic.slice(0, 3));
    else left.push([symbol, sic.slice(0, 2)]);
  }
  const two = tally(left.map(([, k]) => k));
  for (const [symbol, k] of left) if ((two.get(k) ?? 0) >= MIN_GROUP_MEMBERS) keyOf.set(symbol, k);
  // The label is the group's own: its key and its members' commonest description.
  const descs = new Map<string, Map<string, number>>();
  for (const [symbol, key] of keyOf) {
    const d = sics[symbol].description;
    const m = descs.get(key) ?? new Map<string, number>();
    m.set(d, (m.get(d) ?? 0) + 1);
    descs.set(key, m);
  }
  const labels = new Map<string, string>();
  for (const [key, m] of descs) {
    const [top] = [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    labels.set(key, `SIC ${key}${top ? ` (${top})` : ""}`);
  }
  const out = new Map<string, IndustryGroup>();
  for (const [symbol, key] of keyOf) out.set(symbol.toUpperCase(), { key, label: labels.get(key)! });
  return out;
}

export const INDUSTRY_GROUPS: Map<string, IndustryGroup> = buildGroupMap((data as { groups: SicMap }).groups);

export function groupOf(symbol: string, groups: Map<string, IndustryGroup> = INDUSTRY_GROUPS): IndustryGroup | null {
  return groups.get(symbol.toUpperCase()) ?? null;
}

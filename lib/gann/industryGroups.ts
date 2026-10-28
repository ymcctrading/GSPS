/**
 * The group map for Gann's relative strength rank within groups (S4: "buy the
 * strongest stocks in the group and sell short the ones in the weakest
 * position", *Wall Street Stock Selector* Ch. VII, the Sugar and Tobacco
 * reviews; *Truth of the Stock Tape* Ch. XVI-XIX, the Motors, Rubbers, Oils,
 * Coppers and Rails). Gann's groups are industries. Since 2026-10-28 the live
 * map (`INDUSTRY_GROUPS`) reads the platform's industries
 * (`buildIndustryGroupMap`), which start from each company's SEC industry code
 * (SIC, `industryGroups.json`, `scripts/fetch-industry-groups.mjs`) and correct
 * the codes that misfile a business; the same map on every surface.
 *
 * `buildGroupMap` is the earlier reading from the raw codes, kept for the
 * rank's tests. Its engineering choices, labelled: the group is the SIC's three-digit industry
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

import { LARGE_CAP_UNIVERSE } from "@/lib/scan/large-cap-universe";
import { industryOf } from "@/lib/universe/industries";

export const MIN_GROUP_MEMBERS = 5;

export interface IndustryGroup {
  /** An industry key ("semiconductors"), a sector's pooled small industries ("energy:other"), or a SIC key from `buildGroupMap`. */
  key: string;
  /** "Semiconductors", or "Energy (other)" for a sector's small industries pooled; "SIC …" from `buildGroupMap`. */
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
  // The label is the group's own: an industry group's key and its members' commonest
  // description; a major group mixes industries, so its key alone.
  const descs = new Map<string, Map<string, number>>();
  for (const [symbol, key] of keyOf) {
    const d = sics[symbol].description;
    if (!d || key.length < 3) {
      if (!descs.has(key)) descs.set(key, new Map());
      continue;
    }
    const m = descs.get(key) ?? new Map<string, number>();
    m.set(d, (m.get(d) ?? 0) + 1);
    descs.set(key, m);
  }
  const labels = new Map<string, string>();
  for (const [key, m] of descs) {
    const top = [...m].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))[0]?.[0];
    labels.set(key, `SIC ${key}${top ? ` (${top})` : ""}`);
  }
  const out = new Map<string, IndustryGroup>();
  for (const [symbol, key] of keyOf) out.set(symbol.toUpperCase(), { key, label: labels.get(key)! });
  return out;
}

/**
 * Each stock's group from the platform's industries (`lib/universe/industries.ts`),
 * 2026-10-28 (owner: "align the raw SEC codes with Gann's groups"). The SIC
 * code is the raw material, and Gann's grouping rule is the answer: a group is
 * one industry as the market trades it (the Oils, the Motors, the Rails), so a
 * code that misfiles a business (Alphabet as computer programming,
 * ConocoPhillips as a refiner, 3M as surgical instruments) is corrected before
 * the stock is ranked against its peers. An industry with fewer than
 * `MIN_GROUP_MEMBERS` stocks joins the other small industries of its sector
 * when they reach the minimum together, else has no group, as the SIC map's
 * major-group fallback did.
 */
export function buildIndustryGroupMap(
  assigned: Record<string, { key: string; label: string; sector: string; sectorLabel: string }>,
): Map<string, IndustryGroup> {
  const size = new Map<string, number>();
  for (const { key } of Object.values(assigned)) size.set(key, (size.get(key) ?? 0) + 1);
  const left = new Map<string, number>();
  for (const { key, sector } of Object.values(assigned)) {
    if ((size.get(key) ?? 0) < MIN_GROUP_MEMBERS) left.set(sector, (left.get(sector) ?? 0) + 1);
  }
  const out = new Map<string, IndustryGroup>();
  for (const [symbol, a] of Object.entries(assigned)) {
    if ((size.get(a.key) ?? 0) >= MIN_GROUP_MEMBERS) out.set(symbol.toUpperCase(), { key: a.key, label: a.label });
    else if ((left.get(a.sector) ?? 0) >= MIN_GROUP_MEMBERS) {
      out.set(symbol.toUpperCase(), { key: `${a.sector}:other`, label: `${a.sectorLabel} (other)` });
    }
  }
  return out;
}

function universeIndustries() {
  const out: Record<string, { key: string; label: string; sector: string; sectorLabel: string }> = {};
  for (const symbol of LARGE_CAP_UNIVERSE) {
    const i = industryOf(symbol);
    if (i) out[symbol.toUpperCase()] = i;
  }
  return out;
}

export const INDUSTRY_GROUPS: Map<string, IndustryGroup> = buildIndustryGroupMap(universeIndustries());

export function groupOf(symbol: string, groups: Map<string, IndustryGroup> = INDUSTRY_GROUPS): IndustryGroup | null {
  return groups.get(symbol.toUpperCase()) ?? null;
}

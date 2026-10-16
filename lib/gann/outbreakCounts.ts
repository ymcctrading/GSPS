/**
 * Daniel's day counts from an outbreak (A-TIME-33), research and context only.
 *
 * Source (class A as fiction, *The Tunnel Thru the Air*, 1927): 1,290 days
 * added to the 1928 outbreak, with 1,335 "45 days more" (Dan. 12:11-12;
 * printed p. 372, PDF 377); the 1,335 days read as the troubled stretch from
 * March 1931 to the end of June 1932 (printed p. 213, PDF 218); Daniel's 70
 * weeks (printed pp. 370, 372-373, PDF 375, 377-378). The book turns the 70
 * weeks into 490 years by "a day for a year"; here they are read as 490 days,
 * the plain count, alongside the two day counts.
 *
 * The anchor is an engineering choice, labelled and fixed before any
 * measurement: the book counts from the outbreak of a war, which a stock has
 * no counterpart for. GSPS counts from the major turns of the stock's own
 * long monthly chart, the same pivots the month counts use
 * (`secondaryTime.ts#monthlyHits`: `findPivots(monthly, 3)`, then
 * `majorPivots`). A monthly pivot is dated only to its month, so a count
 * lands in a window from the pivot month's first day plus the count to its
 * last day plus the count; nothing finer is claimed.
 *
 * Three-question basis. Source: as above, a novel, so it corroborates and is
 * never a rule on its own. Cycles: a fixed-count recurrence claim with no base
 * rate; no Dewey item is cleared, so it is a measured context factor and
 * never gates. Hermetic: Cause and Effect, the time a disturbance takes to run
 * its course measured from the disturbance itself.
 */
import type { Bar } from "@/lib/types";
import { findPivots, majorPivots } from "@/lib/analysis/pivots";

export const OUTBREAK_DAY_COUNTS = [490, 1290, 1335] as const;

export interface OutbreakCountHit {
  /** The anchor pivot's month (YYYY-MM). */
  pivotMonth: string;
  pivotKind: "high" | "low";
  days: (typeof OUTBREAK_DAY_COUNTS)[number];
  /** The window the count lands in (YYYY-MM-DD). */
  from: string;
  to: string;
}

const DAY_MS = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

export function readOutbreakCounts(monthly: Bar[] | null | undefined, asOf: Date): OutbreakCountHit[] {
  if (!monthly || monthly.length < 24) return [];
  const today = Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate());
  const out: OutbreakCountHit[] = [];
  for (const p of majorPivots(findPivots(monthly, 3))) {
    const d = new Date(p.bar.t);
    const first = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
    const last = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0);
    for (const days of OUTBREAK_DAY_COUNTS) {
      const from = first + days * DAY_MS;
      const to = last + days * DAY_MS;
      if (today >= from && today <= to) out.push({ pivotMonth: p.bar.t.slice(0, 7), pivotKind: p.kind, days, from: iso(from), to: iso(to) });
    }
  }
  return out;
}

export function describeOutbreakCounts(hits: OutbreakCountHit[]): string[] {
  return hits.map(
    (h) =>
      `${h.days.toLocaleString("en-US")} days from the ${h.pivotMonth} ${h.pivotKind === "high" ? "top" : "bottom"} lands ${h.from} to ${h.to}, a long count watched for a change. Shown for context; it does not change the setup.`,
  );
}

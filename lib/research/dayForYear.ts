/**
 * A day for a year (A-TIME-31), research only and confluence-only. Nothing
 * scores, gates or displays from it; a guard test checks no module outside
 * `lib/research` reads it.
 *
 * Source (class A, *Tunnel Thru the Air*, W022 pp. 371 and 373, PDF 376 and
 * 378): "the Lord had appointed a day for a year" (Ezekiel), and Ezek. 4:5-6's
 * 390 and 40 days, "each day for a year", read as 40 years. Gann's reading
 * there is scriptural; he gives no market rule built on it, so the owner's
 * call (Q34) keeps it research-only, and "Gann answers it" (2026-10-21) does
 * not move it: no Gann method says where a day-for-a-year count acts.
 *
 * What it computes: a count of days from an anchor, read as the same count of
 * years (`dayCountAsYears`), and the reverse (`yearCountAsDays`), so a study
 * can set the dates a daily count points to beside the turns it is tested
 * against.
 *
 * Three-question basis:
 * 1. Source: as above, class A, a scriptural reading with no market rule.
 * 2. Cycles: a claim that a short count repeats at a long scale. Untested
 *    against a base rate; it clears none of Dewey's items.
 * 3. Hermetic: Correspondence (as above, so below: the day mirrors the year),
 *    held as a hypothesis, never as evidence.
 */

/** The month (YYYY-MM) that `days` counted as years from `anchor` (YYYY-MM-DD) points to. */
export function dayCountAsYears(anchor: string, days: number): string | null {
  const start = new Date(`${anchor.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || !Number.isInteger(days) || days < 0) return null;
  return new Date(Date.UTC(start.getUTCFullYear() + days, start.getUTCMonth(), 1)).toISOString().slice(0, 7);
}

/** The date (YYYY-MM-DD) that `years` counted as days from `anchor` (YYYY-MM-DD) points to. */
export function yearCountAsDays(anchor: string, years: number): string | null {
  const start = Date.parse(`${anchor.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(start) || !Number.isInteger(years) || years < 0) return null;
  return new Date(start + years * 86_400_000).toISOString().slice(0, 10);
}

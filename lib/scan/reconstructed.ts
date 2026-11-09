/**
 * Reconstructed scan days: rows the scheduled evening scan did not write on
 * its evening, rebuilt later by `scripts/backfill-daily-scans.mjs` (the
 * hosting pause, Oct 31 to Nov 30, 2026). The backfill stamps every row it
 * writes with `detail.backfilledAt`, the real time of the write; a live scan
 * never sets it. That stamp is the flag: no column is added, so the refill
 * needs no migration, and `daily_scans` keeps one shape for both.
 *
 * Every screen that lists scan history says so on a reconstructed day, so a
 * member never takes a rebuilt list for one the scan published that evening
 * ("only the real"). Imported by client components: the strings here ship in
 * the bundle, so they name no source.
 *
 * Three-question basis: no trading rule is involved (a labelling rule), so
 * Gann's method and the cycle literature don't apply. Hermetic fit,
 * Correspondence: the record shown must correspond to the event it records.
 * Fourth question: live scan ⊗ reconstruction is a mixture, not a creation;
 * the label keeps the two apart rather than joining them.
 */

/** True when a `daily_scans` row's detail carries the backfill's stamp. */
export function isReconstructed(detail: { backfilledAt?: unknown } | null | undefined): boolean {
  return typeof detail?.backfilledAt === "string" && detail.backfilledAt.length > 0;
}

/** The short marker shown beside a reconstructed day. */
export const RECONSTRUCTED_LABEL = "Reconstructed after the fact";

/** The note behind the marker: what differs from a list published that evening. */
export const RECONSTRUCTED_NOTE =
  "The scheduled scan did not run that evening, so this list was rebuilt later from market data up to that evening's close. " +
  "It started from a fixed list of large companies instead of that day's most active stocks, and stocks that have split since were left out. " +
  "No member saw this list that evening, and no alerts were sent for it.";

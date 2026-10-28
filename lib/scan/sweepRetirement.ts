/**
 * GSPS — the day's market scan retires the night's sweep plans it no longer
 * reads (Gann alignment audit, scan share, SUS-21). Shared by
 * `/api/market-scan` and the scheduled scans (`lib/entitlements/scheduled-scan.ts`),
 * which both re-score the sweep's best first, so either reading retires them.
 *
 * Mandate: 1. A new reading of the swing structure replaces the old plan; it
 * is never resumed from older levels (NSTD Rule 6; Overnight Chart rule 4).
 * 2. No periodicity claim; Dewey's checklist does not apply. 3. Cause and
 * Effect: the later reading is the cause the night's plan ends on.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { hasTradePlan, type MarketScanOutput } from "@/lib/marketScan";
import { equitySession, etDateKey, etParts } from "@/lib/market/session";
import { isEarlyClose } from "@/lib/market/calendar";
import { retireOverruledSweepRows } from "@/lib/scan/universeSweep";

/**
 * 9:50 AM New York: the free stock feed runs about 16 minutes late, so before
 * this the latest trade it returns can still be a pre-market print
 * (engineering margin over that lag, labelled).
 */
const FIRST_REGULAR_QUOTE_ET_MINUTES = 9 * 60 + 50;
/** 1:00 PM New York, an early close's end. */
const EARLY_CLOSE_ET_MINUTES = 13 * 60;

/** The scan's quotes are regular-session prints: past the feed's opening lag, before the close. */
export function pricedInRegularSession(now: Date): boolean {
  if (equitySession(now) !== "regular") return false;
  const minutes = etParts(now).minutes;
  if (minutes < FIRST_REGULAR_QUOTE_ET_MINUTES) return false;
  return !isEarlyClose(etDateKey(now)) || minutes < EARLY_CLOSE_ET_MINUTES;
}

/**
 * Checks the swept symbols' reads in `output` against the night's rows and
 * retires the ones no longer borne out. Only on a scan whose stocks were read
 * and priced in the regular session (a pre- or post-market quote never
 * retires a plan). Best-effort and timed: it logs what it read, retired and
 * how long it took, and never throws.
 */
export async function retireSweepFromScan(
  service: SupabaseClient,
  basis: string | null,
  sweptSymbols: readonly string[],
  output: Pick<MarketScanOutput, "equitiesRead" | "stockReads">,
  now: Date = new Date(),
  log: string = "market-scan",
): Promise<number> {
  if (!basis || !output.equitiesRead || sweptSymbols.length === 0 || !pricedInRegularSession(now)) return 0;
  const started = Date.now();
  const swept = new Set(sweptSymbols.map((s) => s.toUpperCase()));
  const rereads = output.stockReads
    .filter((r) => swept.has(r.symbol.toUpperCase()))
    .map((r) => ({
      symbol: r.symbol,
      error: Boolean(r.error),
      direction: r.direction,
      outputState: r.error ? null : r.decision.outputState,
      planned: !r.error && hasTradePlan(r),
    }));
  const retired = await retireOverruledSweepRows(service, basis, rereads, now).catch(() => 0);
  console.info(`${log}: sweep retirement read ${rereads.length}, retired ${retired} in ${Date.now() - started}ms`);
  return retired;
}

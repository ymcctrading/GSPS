/**
 * Each scan-universe stock's confirmed first-trade date (C-ASTRO-09), for
 * Bucholtz's first-trade chart (`firstTradeChart.ts`). Fetched once by
 * `scripts/fetch-first-trade-dates.mjs` through the workflow
 * `fetch-first-trade-dates.yml` and checked in as `firstTradeDates.json`, so
 * the live scan and the replay read the same dates and nothing at runtime
 * calls Wikidata or Yahoo. Only a "confirmed" date is returned: Wikidata's
 * listing on a New York exchange and Yahoo's first daily bar agreeing within 3
 * days (Chuck, 2026-10-22: "Search for, confirm and ultimately use these
 * dates"). A single-source or conflicting date is kept in the file for review
 * and never read.
 *
 * Three-question basis:
 * 1. Gann: none; Bucholtz, Tier C. The dates themselves are records, not a rule.
 * 2. Cycles: no recurrence claim of its own.
 * 3. Hermetic: Correspondence (a birth date as the stock's own heaven), held
 *    as a hypothesis.
 */
import data from "@/lib/gann/firstTradeDates.json";

interface FirstTradeRow {
  date: string | null;
  status: "confirmed" | "single" | "conflict" | "none";
}

const DATES = (data as { dates: Record<string, FirstTradeRow> }).dates;

/** The confirmed first-trade date (YYYY-MM-DD) for `symbol`, or null. */
export function confirmedFirstTrade(symbol: string | null | undefined): string | null {
  if (!symbol) return null;
  const row = DATES[symbol.toUpperCase()];
  return row?.status === "confirmed" && row.date ? row.date : null;
}

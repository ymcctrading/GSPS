/**
 * Per-symbol reference data for Gann's capital-stock and incorporation-date
 * rules (parity roadmap D2 and D3), read from the rows
 * `scripts/fetch-instrument-reference.mjs` stored (migration 0083). Nothing
 * here calls SEC or Wikidata.
 *
 * The live scan reads it through `getInstrumentReference`, which loads the
 * whole table once per server instance (about 800 rows in one or two
 * requests) and keeps it for `CACHE_TTL_MS`, so a scan never waits on a query
 * per symbol (AGENTS.md "Speed is a product requirement"). Every read fails
 * soft: no service key, a missing table or a network error gives `null`,
 * and the readings that need it are simply absent.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Inception, InceptionPrecision } from "@/lib/gann/incorporationCycle";

export interface InstrumentReference {
  symbol: string;
  /** Latest reported shares outstanding (all classes). */
  sharesOutstanding: number | null;
  sharesAsOf: string | null;
  inception: Inception | null;
}

/** One reported share count, as stored in `instrument_shares_outstanding`. */
export interface SharesPoint {
  asOf: string;
  filed: string;
  shares: number;
}

const CACHE_TTL_MS = 6 * 3600 * 1000;
const PAGE = 1000;

function serviceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

interface ProfileRow {
  shares_outstanding: number | string | null;
  shares_outstanding_as_of: string | null;
  inception_date: string | null;
  inception_precision: InceptionPrecision | null;
}

function toReference(symbol: string, p: ProfileRow | null): InstrumentReference {
  const shares = p?.shares_outstanding != null ? Number(p.shares_outstanding) : null;
  return {
    symbol,
    sharesOutstanding: shares !== null && Number.isFinite(shares) && shares > 0 ? shares : null,
    sharesAsOf: p?.shares_outstanding_as_of ?? null,
    inception:
      p?.inception_date && p.inception_precision ? { date: p.inception_date, precision: p.inception_precision } : null,
  };
}

const PROFILE_COLUMNS = "shares_outstanding, shares_outstanding_as_of, inception_date, inception_precision";

async function loadAll(client: SupabaseClient): Promise<Map<string, InstrumentReference>> {
  const out = new Map<string, InstrumentReference>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from("instrument")
      .select(`symbol, instrument_profile!inner(${PROFILE_COLUMNS})`)
      .eq("asset_class", "us_equity")
      .order("symbol")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const profile = (Array.isArray(row.instrument_profile) ? row.instrument_profile[0] : row.instrument_profile) as
        | ProfileRow
        | undefined;
      out.set(String(row.symbol).toUpperCase(), toReference(String(row.symbol).toUpperCase(), profile ?? null));
    }
    if (!data || data.length < PAGE) break;
  }
  return out;
}

let cache: { at: number; rows: Promise<Map<string, InstrumentReference> | null> } | null = null;

/** The stored reference for `symbol`, or null when there is none or the table can't be read. */
export async function getInstrumentReference(symbol: string): Promise<InstrumentReference | null> {
  if (!cache || Date.now() - cache.at > CACHE_TTL_MS) {
    const client = serviceClient();
    const rows = client
      ? loadAll(client).catch((err) => {
          console.warn(`[instrument-reference] load failed: ${err instanceof Error ? err.message : String(err)}`);
          return null;
        })
      : Promise.resolve(null);
    cache = { at: Date.now(), rows };
  }
  const rows = await cache.rows;
  return rows?.get(symbol.toUpperCase()) ?? null;
}

/** Test hook: forget the cached table. */
export function resetInstrumentReferenceCache(): void {
  cache = null;
}

/**
 * The reference and full share-count history for each symbol, for the
 * backtest. One query per table, not per session.
 */
export async function loadInstrumentReferenceHistory(
  symbols: string[],
): Promise<Map<string, { reference: InstrumentReference; history: SharesPoint[] }>> {
  const out = new Map<string, { reference: InstrumentReference; history: SharesPoint[] }>();
  const client = serviceClient();
  if (!client || symbols.length === 0) return out;
  try {
    const upper = symbols.map((s) => s.toUpperCase());
    const { data, error } = await client
      .from("instrument")
      .select(`id, symbol, instrument_profile(${PROFILE_COLUMNS})`)
      .eq("asset_class", "us_equity")
      .in("symbol", upper);
    if (error) throw new Error(error.message);
    const bySymbolId = new Map<string, string>();
    for (const row of data ?? []) {
      const symbol = String(row.symbol).toUpperCase();
      const profile = (Array.isArray(row.instrument_profile) ? row.instrument_profile[0] : row.instrument_profile) as
        | ProfileRow
        | undefined;
      out.set(symbol, { reference: toReference(symbol, profile ?? null), history: [] });
      bySymbolId.set(String(row.id), symbol);
    }
    const ids = [...bySymbolId.keys()];
    for (let from = 0; ids.length > 0; from += PAGE) {
      const { data: rows, error: hErr } = await client
        .from("instrument_shares_outstanding")
        .select("instrument_id, as_of, filed, shares")
        .in("instrument_id", ids)
        .order("instrument_id")
        .order("filed")
        .order("as_of")
        .range(from, from + PAGE - 1);
      if (hErr) throw new Error(hErr.message);
      for (const r of rows ?? []) {
        const entry = out.get(bySymbolId.get(String(r.instrument_id)) ?? "");
        entry?.history.push({ asOf: r.as_of, filed: r.filed, shares: Number(r.shares) });
      }
      if (!rows || rows.length < PAGE) break;
    }
  } catch (err) {
    console.warn(`[instrument-reference] history load failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  return out;
}

/** Share-count ratios read as a stock split (or reverse split) between two filings. */
const SPLIT_RATIOS = [1.5, 2, 3, 4, 5, 6, 7, 8, 10, 15, 20, 25, 30, 40, 50];
const SPLIT_TOLERANCE = 0.03;

function splitFactor(ratio: number): number | null {
  for (const r of SPLIT_RATIOS) {
    if (Math.abs(ratio / r - 1) <= SPLIT_TOLERANCE) return r;
    if (Math.abs(ratio * r - 1) <= SPLIT_TOLERANCE) return 1 / r;
  }
  return null;
}

/**
 * The share count that was public on `date` (the latest filed before it),
 * restated to today's split basis.
 *
 * The replay's bars are split-adjusted (`lib/data/alpaca.ts` requests
 * `adjustment=split`), so a pre-split count read against them would be off
 * by the split ratio. A jump between consecutive filings that matches a
 * common split ratio within 3% is taken as a split, and earlier counts are
 * multiplied by it. Engineering choice: a stock issue or buyback that
 * happens to land on such a ratio would be misread as a split, which is rare
 * for the large caps this covers.
 */
export function splitAdjustedSharesAsOf(history: SharesPoint[], date: string): number | null {
  // One count per filing: the one for its latest date. Filings also repeat
  // earlier periods as comparatives, restated after a split, and those would
  // read as splits of their own.
  const byFiled = new Map<string, SharesPoint>();
  for (const p of history) {
    const prev = byFiled.get(p.filed);
    if (!prev || p.asOf > prev.asOf) byFiled.set(p.filed, p);
  }
  const series = [...byFiled.values()].sort((a, b) => a.filed.localeCompare(b.filed));
  if (series.length === 0) return null;
  // factors[i]: multiply series[i] by this to reach the latest filing's basis.
  const factors = new Array<number>(series.length).fill(1);
  for (let i = series.length - 2; i >= 0; i--) {
    factors[i] = factors[i + 1] * (splitFactor(series[i + 1].shares / series[i].shares) ?? 1);
  }
  let idx = -1;
  for (let i = 0; i < series.length && series[i].filed < date; i++) idx = i;
  return idx >= 0 ? series[idx].shares * factors[idx] : null;
}

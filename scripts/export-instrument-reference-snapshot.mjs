#!/usr/bin/env node
/**
 * Writes lib/data/instrumentReferenceSnapshot.json: the stored filings facts
 * (company name, shares outstanding and their filed history, inception date)
 * for every US equity in `instrument`, `instrument_profile` and
 * `instrument_shares_outstanding` (migration 0083).
 *
 * `loadInstrumentReferenceHistory` reads that file when no service key is
 * set, so a backtest run without one (the GitHub workflow) reads the same
 * facts the live scan reads from the tables. Re-run it after
 * `fetch-instrument-reference.mjs` changes the stored rows, and commit the
 * file.
 *
 *   SUPABASE_SECRET_KEY=... node scripts/export-instrument-reference-snapshot.mjs
 *
 * Read-only. Plain PostgREST calls, as `fetch-instrument-reference.mjs` makes
 * them, so it also works where the sandbox attaches the key itself.
 */

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(root, "lib/data/instrumentReferenceSnapshot.json");
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://vebhpmmzxixlhujlptue.supabase.co";
const PAGE = 1000;

async function get(pathAndQuery, from) {
  const key = process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const headers = { Accept: "application/json", Range: `${from}-${from + PAGE - 1}` };
  if (key) {
    headers.apikey = key;
    headers.Authorization = `Bearer ${key}`;
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, { headers });
  const text = await res.text();
  if (!res.ok) throw new Error(`GET ${pathAndQuery.split("?")[0]}: HTTP ${res.status} ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

async function all(pathAndQuery) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const page = await get(pathAndQuery, from);
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

const instruments = await all(
  "instrument?asset_class=eq.us_equity&select=id,symbol,name,instrument_profile(shares_outstanding,shares_outstanding_as_of,inception_date,inception_precision)&order=symbol",
);
const bySymbol = {};
const byId = new Map();
for (const row of instruments) {
  const p = (Array.isArray(row.instrument_profile) ? row.instrument_profile[0] : row.instrument_profile) ?? {};
  const symbol = String(row.symbol).toUpperCase();
  bySymbol[symbol] = {
    name: row.name ?? null,
    sharesOutstanding: p.shares_outstanding ?? null,
    sharesAsOf: p.shares_outstanding_as_of ?? null,
    inceptionDate: p.inception_date ?? null,
    inceptionPrecision: p.inception_precision ?? null,
    history: [],
  };
  byId.set(String(row.id), symbol);
}
const shares = await all("instrument_shares_outstanding?select=instrument_id,as_of,filed,shares&order=instrument_id,filed,as_of");
let rows = 0;
for (const r of shares) {
  const symbol = byId.get(String(r.instrument_id));
  if (!symbol) continue;
  bySymbol[symbol].history.push([r.as_of, r.filed, Number(r.shares)]);
  rows += 1;
}
const sorted = Object.fromEntries(Object.keys(bySymbol).sort().map((s) => [s, bySymbol[s]]));
await writeFile(
  OUT,
  JSON.stringify({
    exportedAt: new Date().toISOString(),
    source: "instrument, instrument_profile, instrument_shares_outstanding (us_equity)",
    symbols: sorted,
  }),
);
process.stderr.write(`Wrote ${Object.keys(sorted).length} symbols and ${rows} share counts to ${path.relative(root, OUT)}.\n`);

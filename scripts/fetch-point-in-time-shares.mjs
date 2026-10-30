#!/usr/bin/env node
/**
 * Fetches the share-count history of every S&P 500 ticker since `--from` that
 * today's list (`LARGE_CAP_UNIVERSE`) doesn't hold: the companies since bought
 * out, renamed, failed or shrunk below the floor. The backtest's point-in-time
 * universe (`lib/universe/pointInTime.ts`) reads these counts to tell whether
 * each was over the $10B floor in a past year; without one, a departed company
 * fails closed and the survivorship stays. Output: `lib/universe/pointInTimeShares.json`,
 * checked in, so nothing at runtime calls SEC or Wikidata.
 *
 * Usage:
 *   SEC_USER_AGENT="Name contact@example.com" node scripts/fetch-point-in-time-shares.mjs \
 *     [--from 2015-01-01] [--out lib/universe/pointInTimeShares.json]
 *
 * This sandbox can't reach sec.gov or Wikidata, so the workflow
 * `.github/workflows/fetch-point-in-time-shares.yml` runs it and commits the file.
 *
 * The CIK: a departed ticker is no longer in SEC's ticker list, and a ticker
 * may since belong to another company, so Wikidata is read first (the company
 * whose stock-exchange statement carries the ticker, P414 with P249, and its
 * SEC CIK, P5531), keeping the company whose listing under the ticker ended
 * nearest the day it left the index. SEC's current list is the fallback, for a
 * ticker still traded under its name, and `KNOWN_CIKS` last, for a few bought
 * out or renamed since 2019 that neither names (checked against SEC's own
 * entity name). Either way the counts must cover the
 * ticker's time in the index (a filing within 18 months before it left, or
 * before today while it is still in), or the record is kept without them and
 * noted: a ticker reused by a later company files nothing for the earlier years.
 *
 * Shares: as `scripts/fetch-instrument-reference.mjs` reads them (the
 * cover-page count, then the balance-sheet count, then basic weighted shares;
 * classes on one filing summed; 20-F filers left out; under a million dropped),
 * with the whole history since `--from`, and no "current" requirement, since
 * a departed company stopped filing.
 */

import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const UA = process.env.SEC_USER_AGENT;
if (!UA) {
  console.error("Set SEC_USER_AGENT (a name and contact email, as SEC requires) and re-run.");
  process.exit(1);
}

let from = "2015-01-01";
let out = "lib/universe/pointInTimeShares.json";
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === "--from") from = process.argv[++i];
  else if (process.argv[i] === "--out") out = process.argv[++i];
  else {
    console.error(`Unknown argument ${process.argv[i]}`);
    process.exit(1);
  }
}

const STALE_DAYS = 548;
const MIN_SHARES = 1_000_000;
const SHARE_CONCEPTS = [
  ["dei", "EntityCommonStockSharesOutstanding"],
  ["us-gaap", "CommonStockSharesOutstanding"],
  ["us-gaap", "WeightedAverageNumberOfSharesOutstandingBasic"],
];
const DAY_MS = 86_400_000;

/**
 * CIKs for departed tickers that neither Wikidata's listing statements nor
 * SEC's current list name (bought out or renamed since 2019, so inside the
 * replay's span). Each is kept only if SEC's own entity name for the CIK holds
 * the fragment, so a wrong number is refused rather than read.
 */
const KNOWN_CIKS = {
  ADS: ["0001101215", "alliance data|bread financial"],
  ANTM: ["0001156039", "anthem|elevance"],
  CDAY: ["0001725057", "ceridian|dayforce"],
  CELG: ["0000816284", "celgene"],
  CTL: ["0000018926", "centurylink|lumen"],
  CXO: ["0001358071", "concho"],
  DAY: ["0001725057", "ceridian|dayforce"],
  GPS: ["0000039911", "gap"],
  INFO: ["0001598014", "ihs markit"],
  KSU: ["0000054480", "kansas city southern"],
  UTX: ["0000101829", "united technologies|raytheon|rtx"],
  VIAC: ["0000813828", "viacom|cbs|paramount"],
  XEC: ["0001168054", "cimarex"],
  XLNX: ["0000743988", "xilinx"],
};

function universeFromSource() {
  const text = readFileSync(path.join(root, "lib/scan/large-cap-universe.ts"), "utf8");
  const start = text.indexOf("export const LARGE_CAP_UNIVERSE");
  const body = text.slice(start, text.indexOf("];", start));
  return new Set([...body.matchAll(/"([A-Z][A-Z0-9.\-]{0,9})"/g)].map((m) => m[1]));
}

/** Departed tickers: ticker → the day it left the index (null while still in). */
function departedTickers() {
  const today = universeFromSource();
  const history = JSON.parse(readFileSync(path.join(root, "lib/universe/sp500History.json"), "utf8"));
  const outMap = new Map();
  for (const [ticker, spans] of Object.entries(history.tickers)) {
    if (today.has(ticker)) continue;
    const overlapping = spans.filter(([, end]) => end === null || end >= from);
    if (overlapping.length === 0) continue;
    const open = overlapping.some(([, end]) => end === null);
    outMap.set(ticker, open ? null : overlapping.reduce((m, [, end]) => (end > m ? end : m), ""));
  }
  return outMap;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastSec = 0;
async function secGet(url) {
  const wait = lastSec + 125 - Date.now();
  if (wait > 0) await sleep(wait);
  lastSec = Date.now();
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (res.status === 404) return null;
    if (res.ok) return res.json();
    if (res.status === 429 || res.status >= 500) {
      await sleep(2000 * 2 ** attempt);
      continue;
    }
    throw new Error(`${url}: HTTP ${res.status}`);
  }
  throw new Error(`${url}: gave up after retries`);
}

/** Wikidata: ticker → [{ cik10, end }] for every company listed under it. */
async function wikidataCiks(tickers) {
  const found = new Map();
  for (let i = 0; i < tickers.length; i += 100) {
    const values = tickers.slice(i, i + 100).map((t) => `"${t}"`).join(" ");
    const query = `SELECT ?ticker ?cik ?end WHERE {
      VALUES ?ticker { ${values} }
      ?item p:P414 ?st . ?st pq:P249 ?ticker .
      OPTIONAL { ?st pq:P582 ?end }
      ?item wdt:P5531 ?cik .
    }`;
    const res = await fetch(`https://query.wikidata.org/sparql?query=${encodeURIComponent(query)}`, {
      headers: { "User-Agent": UA, Accept: "application/sparql-results+json" },
    });
    if (!res.ok) throw new Error(`Wikidata HTTP ${res.status}`);
    const json = await res.json();
    for (const b of json.results.bindings) {
      const list = found.get(b.ticker.value) ?? [];
      list.push({ cik10: b.cik.value.replace(/\D/g, "").padStart(10, "0"), end: b.end ? b.end.value.slice(0, 10) : null });
      found.set(b.ticker.value, list);
    }
    await sleep(1000);
  }
  return found;
}

/** The company whose listing under the ticker ended nearest the day it left the index. */
function chooseCik(options, leftOn) {
  const ciks = [...new Set(options.map((o) => o.cik10))];
  // One company still listed under the ticker: the same one, if it never left
  // (a company dropped from the index for size keeps trading).
  if (ciks.length === 1 && options.every((o) => o.end === null)) return ciks[0];
  const target = Date.parse(leftOn ?? new Date().toISOString().slice(0, 10));
  let best = null;
  let bestGap = Infinity;
  for (const o of options) {
    const gap = Math.abs((o.end ? Date.parse(o.end) : Date.now()) - target);
    if (gap < bestGap) {
      best = o.cik10;
      bestGap = gap;
    }
  }
  return bestGap <= 400 * DAY_MS ? best : null;
}

function shareSeries(concept) {
  const rows = Array.isArray(concept?.units?.shares) ? concept.units.shares : [];
  const byKey = new Map();
  for (const r of rows) {
    if (!(r.val > 0) || !r.end || !r.filed) continue;
    const key = `${r.accn}|${r.end}`;
    const prev = byKey.get(key);
    if (prev) prev.shares += r.val;
    else byKey.set(key, { asOf: r.end, filed: r.filed, shares: r.val, form: r.form ?? null });
  }
  return [...byKey.values()].sort((a, b) => a.filed.localeCompare(b.filed) || a.asOf.localeCompare(b.asOf));
}

/** Whether a filing falls in the 18 months before the ticker left the index (or today). */
function coversIndexTime(series, leftOn) {
  const end = Date.parse(leftOn ?? new Date().toISOString().slice(0, 10));
  return series.some((s) => {
    const t = Date.parse(s.filed);
    return t <= end + 120 * DAY_MS && t >= end - STALE_DAYS * DAY_MS;
  });
}

async function fetchShares(cik10, leftOn, expectName) {
  for (const [tax, tag] of SHARE_CONCEPTS) {
    const concept = await secGet(`https://data.sec.gov/api/xbrl/companyconcept/CIK${cik10}/${tax}/${tag}.json`);
    if (concept && expectName && !new RegExp(expectName, "i").test(concept.entityName ?? "")) {
      return { note: `CIK ${cik10} is ${concept.entityName ?? "unnamed"}, not ${expectName}` };
    }
    const series = shareSeries(concept).filter((s) => s.filed >= from && s.shares >= MIN_SHARES);
    if (series.length === 0) continue;
    if (/^20-F/.test(series[series.length - 1].form ?? "")) return { note: "20-F filer: ordinary shares, not the ADRs that traded here" };
    if (!coversIndexTime(series, leftOn)) continue;
    const rows = [...new Map(series.map((s) => [`${s.asOf}|${s.filed}`, [s.asOf, s.filed, s.shares]])).values()];
    return { source: `sec:${tax}:${tag}`, history: rows };
  }
  return { note: "no share count filed during its time in the index" };
}

async function main() {
  const departed = departedTickers();
  const tickers = [...departed.keys()].sort();
  console.log(`${tickers.length} tickers in the S&P 500 since ${from} that today's list doesn't hold`);

  let wiki = new Map();
  try {
    wiki = await wikidataCiks(tickers);
  } catch (err) {
    console.warn(`Wikidata read failed (${err instanceof Error ? err.message : String(err)}); SEC's current list only.`);
  }
  const secList = await secGet("https://www.sec.gov/files/company_tickers.json");
  const secByTicker = new Map(Object.values(secList ?? {}).map((t) => [t.ticker.toUpperCase(), String(t.cik_str).padStart(10, "0")]));

  const symbols = {};
  for (const ticker of tickers) {
    const leftOn = departed.get(ticker);
    const fromWiki = wiki.get(ticker) ? chooseCik(wiki.get(ticker), leftOn) : null;
    const fromSec = secByTicker.get(ticker) ?? secByTicker.get(ticker.replace(/\./g, "-")) ?? null;
    const known = !fromWiki && !fromSec ? KNOWN_CIKS[ticker] ?? null : null;
    const cik10 = fromWiki ?? fromSec ?? known?.[0] ?? null;
    if (!cik10) {
      symbols[ticker] = { cik: null, leftIndex: leftOn, note: "no CIK found (Wikidata or SEC)" };
      continue;
    }
    try {
      const shares = await fetchShares(cik10, leftOn, known?.[1]);
      symbols[ticker] = { cik: cik10, cikSource: fromWiki ? "wikidata" : known ? "known" : "sec", leftIndex: leftOn, ...shares };
    } catch (err) {
      symbols[ticker] = { cik: cik10, leftIndex: leftOn, note: err instanceof Error ? err.message : String(err) };
    }
  }

  const withShares = Object.values(symbols).filter((r) => r.history?.length > 0).length;
  const file = {
    fetchedAt: new Date().toISOString(),
    source: "SEC EDGAR XBRL share counts for the S&P 500's past tickers, by scripts/fetch-point-in-time-shares.mjs",
    from,
    withShares,
    symbols,
  };
  await mkdir(path.dirname(path.resolve(root, out)), { recursive: true });
  await writeFile(path.resolve(root, out), JSON.stringify(file) + "\n");
  console.log(`${withShares}/${tickers.length} with share counts; wrote ${out}`);
  for (const [t, r] of Object.entries(symbols)) if (!r.history) console.log(`  ${t}: ${r.note}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

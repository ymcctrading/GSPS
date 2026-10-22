#!/usr/bin/env node
/**
 * Fetches each scan-universe stock's first-trade date on a US exchange, once,
 * for Bucholtz's first-trade chart (C-ASTRO-09, `lib/research/firstTradeChart.ts`;
 * W013 pp. 96-99, 103: the chart is cast for the first trade, the exchange's
 * city, 9:30 am). The output is checked in (`lib/gann/firstTradeDates.json`),
 * so nothing in the app calls either source and every surface reads the same
 * dates. Re-run when LARGE_CAP_UNIVERSE changes.
 *
 * Usage:
 *   SEC_USER_AGENT="Name contact@example.com" node scripts/fetch-first-trade-dates.mjs [--out lib/gann/firstTradeDates.json]
 *
 * This session's sandbox cannot reach these hosts, so the workflow
 * `.github/workflows/fetch-first-trade-dates.yml` runs it.
 *
 * Two independent sources, and a date is used only when they agree (Chuck,
 * 2026-10-22: "Search for, confirm and ultimately use these dates"):
 * - Wikidata: the company's (matched by SEC CIK, P5531) stock-exchange
 *   statement (P414) on a New York exchange (NYSE, Nasdaq, NYSE American,
 *   NYSE Arca) with a start time (P580) at day precision. The earliest wins.
 * - Yahoo Finance's chart record: `meta.firstTradeDate`, the first daily bar
 *   it holds. Yahoo's history starts in 1962 for the oldest listings, so a
 *   date on or before 1962-01-02 is the start of its data, not a first trade,
 *   and is not counted.
 * Status: "confirmed" when both exist and lie within `AGREE_DAYS` (3) of each
 * other (a listing is often dated the pricing day, the trade the next), dated
 * by Yahoo's bar, the trade itself; "single" when only one source has a date;
 * "conflict" when both do and disagree. Only "confirmed" dates are read
 * (`lib/gann/firstTradeDates.ts`). Engineering choices, labelled: the
 * exchanges, the tolerance and the 1962 floor.
 */

import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const UA = process.env.SEC_USER_AGENT;
if (!UA) {
  console.error("Set SEC_USER_AGENT (a name and contact, as SEC requires) and re-run.");
  process.exit(1);
}
let out = "lib/gann/firstTradeDates.json";
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === "--out") out = process.argv[++i];
  else {
    console.error(`Unknown argument ${process.argv[i]}`);
    process.exit(1);
  }
}

const AGREE_DAYS = 3;
const YAHOO_FLOOR = "1962-01-02";
const US_EXCHANGE = /New York Stock Exchange|NYSE|Nasdaq|NASDAQ/;

function universeFromSource() {
  const text = readFileSync(path.join(root, "lib/scan/large-cap-universe.ts"), "utf8");
  const start = text.indexOf("export const LARGE_CAP_UNIVERSE");
  const body = text.slice(start, text.indexOf("];", start));
  return [...new Set([...body.matchAll(/"([A-Z][A-Z0-9.\-]{0,9})"/g)].map((m) => m[1]))];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, headers, tries = 4) {
  for (let attempt = 0; attempt < tries; attempt++) {
    const res = await fetch(url, { headers });
    if (res.ok) return res.json();
    if (res.status === 404) return null;
    await sleep(1000 * 2 ** attempt);
  }
  return null;
}

const symbols = universeFromSource();
const tickers = await getJson("https://www.sec.gov/files/company_tickers.json", { "User-Agent": UA });
if (!tickers) throw new Error("SEC company_tickers.json unavailable");
const cikOf = new Map(Object.values(tickers).map((t) => [String(t.ticker).toUpperCase(), String(t.cik_str).padStart(10, "0")]));

// Wikidata: earliest day-precision listing on a New York exchange, by CIK.
const wikidata = new Map();
const ciks = [...new Set(symbols.map((s) => cikOf.get(s.replace(".", "-"))).filter(Boolean))];
for (let i = 0; i < ciks.length; i += 150) {
  const values = ciks.slice(i, i + 150).flatMap((c) => [`"${c}"`, `"${String(Number(c))}"`]).join(" ");
  const query = `SELECT ?cik ?exLabel ?start ?precision WHERE {
    VALUES ?cik { ${values} }
    ?item wdt:P5531 ?cik .
    ?item p:P414 ?st . ?st ps:P414 ?ex . ?st pqv:P580 ?v .
    ?v wikibase:timeValue ?start ; wikibase:timePrecision ?precision .
    ?st wikibase:rank ?rank . FILTER(?rank != wikibase:DeprecatedRank)
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
  }`;
  const json = await getJson(`https://query.wikidata.org/sparql?query=${encodeURIComponent(query)}`, {
    "User-Agent": UA,
    Accept: "application/sparql-results+json",
  });
  for (const b of json?.results?.bindings ?? []) {
    if (Number(b.precision.value) !== 11 || !US_EXCHANGE.test(b.exLabel?.value ?? "")) continue;
    const cik = b.cik.value.padStart(10, "0");
    const date = b.start.value.slice(0, 10);
    const prev = wikidata.get(cik);
    if (!prev || date < prev.date) wikidata.set(cik, { date, exchange: b.exLabel.value });
  }
  await sleep(1000);
}

// Yahoo: the first daily bar it holds.
async function yahooFirst(symbol) {
  const sym = symbol.replace(".", "-");
  const json = await getJson(`https://query2.finance.yahoo.com/v8/finance/chart/${sym}?range=5d&interval=1d`, {
    "User-Agent": "Mozilla/5.0",
  }, 2);
  const t = json?.chart?.result?.[0]?.meta?.firstTradeDate;
  if (typeof t !== "number") return null;
  // firstTradeDate is the bar's open in exchange time; noon UTC of that day is the same date.
  return new Date((t + 6 * 3600) * 1000).toISOString().slice(0, 10);
}

const dayGap = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;
const dates = {};
const counts = { confirmed: 0, single: 0, conflict: 0, none: 0 };
for (const symbol of symbols) {
  const w = wikidata.get(cikOf.get(symbol.replace(".", "-")));
  let y = await yahooFirst(symbol);
  if (y && y <= YAHOO_FLOOR) y = null;
  await sleep(250);
  let row;
  if (w && y) row = dayGap(w.date, y) <= AGREE_DAYS ? { date: y, status: "confirmed" } : { date: null, status: "conflict" };
  else if (w || y) row = { date: null, status: "single" };
  else row = { date: null, status: "none" };
  counts[row.status]++;
  if (row.status !== "none") dates[symbol] = { ...row, wikidata: w?.date ?? null, exchange: w?.exchange ?? null, yahoo: y };
}

const file = {
  source: "Wikidata P414/P580 (by SEC CIK) and Yahoo Finance firstTradeDate, via scripts/fetch-first-trade-dates.mjs",
  fetched: new Date().toISOString().slice(0, 10),
  agreeDays: AGREE_DAYS,
  counts,
  dates: Object.fromEntries(Object.entries(dates).sort(([a], [b]) => a.localeCompare(b))),
};
await mkdir(path.dirname(path.resolve(root, out)), { recursive: true });
await writeFile(path.resolve(root, out), JSON.stringify(file, null, 1) + "\n");
console.log(`first-trade dates: ${JSON.stringify(counts)} of ${symbols.length}`);

#!/usr/bin/env node
/**
 * Builds `lib/universe/sp500History.json`: every ticker that was in the S&P 500
 * on or after `--from` (default 2010-01-01), with the dates it entered and left.
 *
 * The backtest's point-in-time universe (`lib/universe/pointInTime.ts`) reads it
 * as a list of candidates: the large companies that existed in a past year,
 * including the ones since acquired, renamed, failed or shrunk below the $10B
 * floor, which today's list (`LARGE_CAP_UNIVERSE`) can't name. Membership in the
 * index decides nothing on its own; each candidate still has to clear the floor
 * on its own market cap for the year.
 *
 * Source: Farrell J. Aultman's `sp500` repository (MIT licence),
 * `sp500_ticker_start_end.csv`, built from Andreas Clenow's 1996-2019 list and
 * Wikipedia's change log since. https://github.com/fja05680/sp500
 * Tickers are as traded at the time (FB, not META), so the backtest reads a
 * past ticker's bars as of its last day in the index.
 *
 * Usage: node scripts/fetch-sp500-history.mjs [--from 2010-01-01] [--out lib/universe/sp500History.json]
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = "https://raw.githubusercontent.com/fja05680/sp500/master/sp500_ticker_start_end.csv";

let from = "2010-01-01";
let out = "lib/universe/sp500History.json";
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === "--from") from = process.argv[++i];
  else if (process.argv[i] === "--out") out = process.argv[++i];
  else {
    console.error(`Unknown argument ${process.argv[i]}`);
    process.exit(1);
  }
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) {
  console.error(`--from must be YYYY-MM-DD (got ${from})`);
  process.exit(1);
}

const res = await fetch(SOURCE);
if (!res.ok) {
  console.error(`${SOURCE}: HTTP ${res.status}`);
  process.exit(1);
}
const lines = (await res.text()).trim().split(/\r?\n/);
if (lines[0].trim() !== "ticker,start_date,end_date") {
  console.error(`Unexpected header: ${lines[0]}`);
  process.exit(1);
}

/** ticker → [start, end | null][] */
const tickers = {};
let lastDate = "";
for (const line of lines.slice(1)) {
  const [ticker, start, end] = line.split(",").map((s) => s.trim());
  if (!ticker || !/^\d{4}-\d{2}-\d{2}$/.test(start) || (end && !/^\d{4}-\d{2}-\d{2}$/.test(end))) {
    console.error(`Malformed row: ${line}`);
    process.exit(1);
  }
  if (start > lastDate) lastDate = start;
  if (end && end > lastDate) lastDate = end;
  if (end && end < from) continue;
  (tickers[ticker] ??= []).push([start, end || null]);
}
for (const spans of Object.values(tickers)) spans.sort((a, b) => a[0].localeCompare(b[0]));

const sorted = Object.fromEntries(Object.entries(tickers).sort(([a], [b]) => a.localeCompare(b)));
const file = {
  source: "fja05680/sp500 sp500_ticker_start_end.csv (MIT licence)",
  sourceUrl: SOURCE,
  fetchedAt: new Date().toISOString().slice(0, 10),
  latestChange: lastDate,
  from,
  tickers: sorted,
};
await mkdir(path.dirname(path.resolve(root, out)), { recursive: true });
await writeFile(path.resolve(root, out), JSON.stringify(file, null, 0).replace(/\],"/g, '],\n"') + "\n");
console.log(`${Object.keys(sorted).length} tickers in the index on or after ${from}; latest change ${lastDate}; wrote ${out}`);

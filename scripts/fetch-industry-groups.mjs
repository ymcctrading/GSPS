#!/usr/bin/env node
/**
 * Fetches each scan-universe stock's SEC industry code (SIC), once, for the
 * group map Gann's relative strength rank reads within groups (S4: "buy the
 * strongest stocks in the group and sell short the ones in the weakest
 * position", *Wall Street Stock Selector* Ch. VII; `lib/gann/industryGroups.ts`).
 * The output is checked in (`lib/gann/industryGroups.json`), so nothing in the
 * app calls SEC and every surface reads the same map. Re-run to refresh, e.g.
 * when LARGE_CAP_UNIVERSE changes.
 *
 * Usage:
 *   SEC_USER_AGENT="Name contact@example.com" node scripts/fetch-industry-groups.mjs [--out lib/gann/industryGroups.json]
 *
 * This session's sandbox cannot reach sec.gov, so the workflow
 * `.github/workflows/fetch-industry-groups.yml` runs it and prints the file.
 *
 * Source: SEC's ticker list (company_tickers.json) for the CIK, then the
 * filer's submissions record (data.sec.gov/submissions) for its SIC code and
 * description. A share-class ticker (BRK.B) is looked up as SEC writes it
 * (BRK-B). A symbol SEC does not list (an ETF, a foreign filer with no US
 * registration) is left out and has no group. SEC asks for a descriptive
 * User-Agent with a contact and at most 10 requests a second; this keeps to
 * about 8 (https://www.sec.gov/os/accessing-edgar-data).
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
let out = "lib/gann/industryGroups.json";
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === "--out") out = process.argv[++i];
  else {
    console.error(`Unknown argument ${process.argv[i]}`);
    process.exit(1);
  }
}

function universeFromSource() {
  const text = readFileSync(path.join(root, "lib/scan/large-cap-universe.ts"), "utf8");
  const start = text.indexOf("export const LARGE_CAP_UNIVERSE");
  const body = text.slice(start, text.indexOf("];", start));
  return [...new Set([...body.matchAll(/"([A-Z][A-Z0-9.\-]{0,9})"/g)].map((m) => m[1]))];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let last = 0;
async function secGet(url) {
  const wait = last + 125 - Date.now();
  if (wait > 0) await sleep(wait);
  last = Date.now();
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

const universe = universeFromSource();
const tickers = await secGet("https://www.sec.gov/files/company_tickers.json");
const cikOf = new Map(Object.values(tickers).map((t) => [String(t.ticker).toUpperCase(), String(t.cik_str).padStart(10, "0")]));

const groups = {};
const missing = [];
for (const symbol of universe) {
  const cik = cikOf.get(symbol) ?? cikOf.get(symbol.replace(/\./g, "-"));
  if (!cik) {
    missing.push(symbol);
    continue;
  }
  const sub = await secGet(`https://data.sec.gov/submissions/CIK${cik}.json`);
  const sic = sub?.sic ? String(sub.sic) : "";
  if (!/^\d{4}$/.test(sic)) {
    missing.push(symbol);
    continue;
  }
  groups[symbol] = { sic, description: String(sub.sicDescription ?? "") };
}

const sorted = Object.fromEntries(Object.keys(groups).sort().map((k) => [k, groups[k]]));
const doc = {
  source: "SEC EDGAR company_tickers.json and submissions (SIC), via scripts/fetch-industry-groups.mjs",
  fetched: new Date().toISOString().slice(0, 10),
  groups: sorted,
  missing: missing.sort(),
};
await mkdir(path.dirname(path.resolve(root, out)), { recursive: true });
await writeFile(path.resolve(root, out), JSON.stringify(doc, null, 1) + "\n");
console.error(`${Object.keys(sorted).length} symbols with a SIC code, ${missing.length} without: ${missing.join(", ")}`);

#!/usr/bin/env node
/**
 * Validates lib/scan/large-cap-universe.ts against Alpaca's live asset list.
 *
 * The committed universe is transcribed from a third-party market-cap export
 * (see that file's header) and was never checked against what Alpaca actually
 * considers a tradable US equity. This script closes that gap: it fetches
 * every active us_equity asset from Alpaca's /v2/assets and reports which
 * committed symbols are missing, inactive, or not tradable.
 *
 * A symbol failing this check is not necessarily wrong -- some are legitimate
 * but temporarily halted, recently renamed, or on a data lag -- but a symbol
 * Alpaca never resolves at all is a wasted coarse-pass slot every single scan,
 * forever, and worth pruning.
 *
 * Usage:
 *   ALPACA_API_KEY=... ALPACA_API_SECRET=... node scripts/validate-large-cap-universe.mjs
 *
 * Reads credentials from ALPACA_API_KEY/ALPACA_API_SECRET (paper or live --
 * this only hits the read-only asset-metadata endpoint, never an order
 * endpoint). Prints a report to stdout and writes the full diff to
 * scripts/.large-cap-validation-report.json (gitignored -- add it if it
 * isn't already, this file is a local diagnostic, not something to commit).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const KEY = process.env.ALPACA_API_KEY;
const SECRET = process.env.ALPACA_API_SECRET;
if (!KEY || !SECRET) {
  console.error("Set ALPACA_API_KEY and ALPACA_API_SECRET (paper or live) and re-run.");
  process.exit(1);
}

// Paper and live share the same asset metadata -- default to paper so this
// never touches a live-trading-scoped key by accident. Override with
// ALPACA_BASE_URL if you specifically want to check against live.
const BASE_URL = process.env.ALPACA_BASE_URL ?? "https://paper-api.alpaca.markets";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const universeFile = path.join(__dirname, "..", "lib", "scan", "large-cap-universe.ts");

function loadUniverse() {
  const content = readFileSync(universeFile, "utf8");
  const match = content.match(/LARGE_CAP_UNIVERSE: string\[\] = \[(.*?)\];/s);
  if (!match) throw new Error(`Could not find LARGE_CAP_UNIVERSE array in ${universeFile}`);
  return [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

async function fetchAllAssets() {
  const res = await fetch(
    `${BASE_URL}/v2/assets?status=active&asset_class=us_equity`,
    { headers: { "APCA-API-KEY-ID": KEY, "APCA-API-SECRET-KEY": SECRET } },
  );
  if (!res.ok) {
    throw new Error(`Alpaca /v2/assets returned ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

async function main() {
  const universe = loadUniverse();
  console.log(`Loaded ${universe.length} symbols from lib/scan/large-cap-universe.ts`);

  console.log(`Fetching active us_equity assets from ${BASE_URL} ...`);
  const assets = await fetchAllAssets();
  console.log(`Alpaca reports ${assets.length} active us_equity assets`);

  const bySymbol = new Map(assets.map((a) => [a.symbol.toUpperCase(), a]));

  const missing = [];
  const notTradable = [];
  const ok = [];

  for (const symbol of universe) {
    const asset = bySymbol.get(symbol.toUpperCase());
    if (!asset) {
      missing.push(symbol);
    } else if (!asset.tradable) {
      notTradable.push({ symbol, status: asset.status, exchange: asset.exchange });
    } else {
      ok.push(symbol);
    }
  }

  console.log("\n=== Summary ===");
  console.log(`OK (active + tradable):        ${ok.length}`);
  console.log(`Not tradable (exists, halted):  ${notTradable.length}`);
  console.log(`Missing (Alpaca has no record): ${missing.length}`);

  if (notTradable.length > 0) {
    console.log("\n--- Not tradable ---");
    for (const r of notTradable) console.log(`  ${r.symbol} (status=${r.status}, exchange=${r.exchange})`);
  }

  if (missing.length > 0) {
    console.log("\n--- Missing from Alpaca entirely (candidates to prune) ---");
    for (const s of missing) console.log(`  ${s}`);
  }

  const reportPath = path.join(__dirname, ".large-cap-validation-report.json");
  const { writeFileSync } = await import("node:fs");
  writeFileSync(
    reportPath,
    JSON.stringify({ generatedAt: new Date().toISOString(), baseUrl: BASE_URL, ok, notTradable, missing }, null, 2),
  );
  console.log(`\nFull report written to ${reportPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Fetches the long monthly record of the US stock market, once, for the
 * market-wide cycle readings that need more history than any vendor's bars
 * reach (Gann's mass pressure, `lib/gann/massPressure.ts`). The output is
 * checked in (`lib/gann/marketHistory.json`), so nothing in the app calls the
 * source and the live scan and the replay read the same record.
 *
 * Usage:
 *   node scripts/fetch-market-history.mjs [--out lib/gann/marketHistory.json]
 *
 * Source: Robert Shiller's monthly S&P composite (1871 onward), as packaged
 * by the datasets project (https://github.com/datasets/s-and-p-500, licence
 * ODC-PDDL). Each month's figure is the average of that month's daily closes.
 * Gann read the Dow averages and, before them, his own railroad averages
 * back to 1856 (Master Course Ch. 7, PDF 224-225); this index is an
 * engineering stand-in for those, labelled as such wherever it is read.
 * Kept: the index (`stocks`), the long-term interest rate (`rate`) and the
 * consumer price index (`cpi`), each null where the source has no figure.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = "https://raw.githubusercontent.com/datasets/s-and-p-500/main/data/data.csv";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let out = "lib/gann/marketHistory.json";
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === "--out") out = process.argv[++i];
  else {
    console.error(`Unknown argument ${process.argv[i]}`);
    process.exit(1);
  }
}

const res = await fetch(SOURCE);
if (!res.ok) {
  console.error(`Fetch failed: ${res.status} ${res.statusText}`);
  process.exit(1);
}
const lines = (await res.text()).trim().split(/\r?\n/);
const header = lines[0].split(",");
const col = (name) => {
  const i = header.indexOf(name);
  if (i < 0) throw new Error(`Column ${name} missing from the source`);
  return i;
};
const [iDate, iStocks, iRate, iCpi] = [col("Date"), col("SP500"), col("Long Interest Rate"), col("Consumer Price Index")];
const rows = lines.slice(1).map((l) => l.split(","));
// A figure of 0 or blank is the source's "not published yet".
const num = (s) => {
  const v = Number(s);
  return Number.isFinite(v) && v > 0 ? v : null;
};
const months = rows.map((r) => r[iDate].slice(0, 7));
for (let i = 1; i < months.length; i++) {
  const [y0, m0] = months[i - 1].split("-").map(Number);
  const [y1, m1] = months[i].split("-").map(Number);
  if (y1 * 12 + m1 !== y0 * 12 + m0 + 1) throw new Error(`Gap in the source between ${months[i - 1]} and ${months[i]}`);
}
const data = {
  source: `Shiller monthly S&P composite via ${SOURCE} (ODC-PDDL), via scripts/fetch-market-history.mjs`,
  fetched: new Date().toISOString().slice(0, 10),
  start: months[0],
  stocks: rows.map((r) => num(r[iStocks])),
  rate: rows.map((r) => num(r[iRate])),
  cpi: rows.map((r) => num(r[iCpi])),
};
const file = path.resolve(root, out);
await mkdir(path.dirname(file), { recursive: true });
await writeFile(file, JSON.stringify(data) + "\n");
console.log(`Wrote ${months.length} months (${months[0]} to ${months[months.length - 1]}) to ${out}`);

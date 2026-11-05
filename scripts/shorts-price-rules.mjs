/**
 * Runs lib/research/shortsPriceRules.ts (the price rules from the owner's two
 * YouTube Shorts of 2026-11-04) and writes the run to docs/replay-runs/.
 * Research only.
 *
 *   node scripts/shorts-price-rules.mjs <dir with SPY.ndjson and DIA.ndjson> <DJA.csv> \
 *     [--out docs/replay-runs/<date>-shorts-price-rules.json]
 *
 * Each .ndjson line is one session {t, o, h, l, c} from
 * /v2/stocks/bars?timeframe=1Day&adjustment=split&feed=sip, 2016-2025.
 * DJA.csv is the owner-private MeasuringWorth Dow file
 * (/mnt/project-files/dow-daily/DJA.csv); it is read, never copied.
 */
import { createServer } from "vite";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [dir, dowPath] = process.argv.slice(2);
const i = process.argv.indexOf("--out");
const out = i === -1 ? null : process.argv[i + 1];

const readNdjson = (f) =>
  readFileSync(f, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .map((b) => ({ t: b.t.slice(0, 10), h: b.h, l: b.l, c: b.c }));

function readDow(f) {
  const rows = [];
  for (const line of readFileSync(f, "utf8").split("\n")) {
    const m = line.match(/^"(\d+)\/(\d+)\/(\d{4})","([\d.]+)"/);
    if (!m) continue;
    const t = `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
    const c = +m[4];
    rows.push({ t, h: c, l: c, c });
  }
  return rows;
}

const server = await createServer({
  configFile: false,
  root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "warn",
});
try {
  const r = await server.ssrLoadModule("/lib/research/shortsPriceRules.ts");
  const dow = readDow(dowPath);
  const series = [
    ["SPY 2016-2025", readNdjson(path.join(dir, "SPY.ndjson")), false],
    ["DIA 2016-2025", readNdjson(path.join(dir, "DIA.ndjson")), false],
    ["Dow closes 1913-1948", dow.filter((b) => b.t >= "1913-01-01" && b.t <= "1948-12-31"), true],
    ["Dow closes 1949-2025", dow.filter((b) => b.t >= "1949-01-01" && b.t <= "2025-12-31"), true],
  ];
  const fix = (n) => (Number.isFinite(n) ? +n.toFixed(4) : null);
  const results = [];
  for (const [name, bars, closeOnly] of series) {
    console.log(name, bars.length, "sessions", bars[0]?.t, "to", bars.at(-1)?.t);
    for (const s of r.scoreSeries(name, bars, closeOnly)) {
      results.push(Object.fromEntries(Object.entries(s).map(([k, v]) => [k, typeof v === "number" ? fix(v) : v])));
    }
  }
  const tests = results.length;
  const cutoff = 0.05 / tests;
  for (const x of results) {
    console.log(
      `${x.rule.padEnd(11)} ${x.series.padEnd(22)} h${String(x.horizon).padEnd(3)} n=${String(x.signals).padEnd(4)} mean ${x.meanPct}% null ${x.nullMeanPct}% hit ${x.hitRate} base ${x.baseRate} p ${x.p}${x.takeProfitRate != null ? ` tp ${x.takeProfitRate}` : ""}`,
    );
  }
  console.log(`${tests} tests, cut-off ${cutoff.toFixed(4)}, passing: ${results.filter((x) => x.p < cutoff).length}, under 0.05: ${results.filter((x) => x.p < 0.05).length}`);
  if (out) {
    writeFileSync(
      path.join(root, out),
      JSON.stringify({ run: "shorts-price-rules", draws: r.DRAWS, side: r.SIDE, tests, cutoff: fix(cutoff), results }, null, 2) + "\n",
    );
    console.log("wrote", out);
  }
} finally {
  await server.close();
}

/**
 * The like-for-like control for a bare-core ledger (quant validation, slice
 * 2): random entries run through the core's own exits and pyramid
 * (`lib/backtest/coreControl.ts`), on the run's frozen bars.
 *
 * Usage:
 *   node scripts/core-control.mjs --ledger <core-long.trades.json[.gz]> --barCache <dir> \
 *     --since 2020-10-30 --draws 50 --out <dir>
 *
 *   --since   the run's own --since: the execution bars start there, as in
 *             backtest-universe.mjs, so the core walks the same sessions
 *   --draws   seeded draws (default 50)
 *   --trail   the run's trail, weeklySwing (default) or eachWeek
 *   --cost    the run's cost a share (default 0.02)
 *
 * Every cached file is checked against the cache's manifest, and only 1Day
 * series are read. Long campaigns only (the core-long cell). Nothing is
 * fetched; nothing touches production.
 */

import { createServer } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function parseArgs(argv) {
  const a = { ledger: null, barCache: null, since: null, draws: 50, out: null, trail: "weeklySwing", cost: 0.02 };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const v = argv[++i];
    if (v === undefined) throw new Error(`Missing value for ${flag}`);
    switch (flag) {
      case "--ledger": a.ledger = v; break;
      case "--barCache": a.barCache = v; break;
      case "--since": a.since = v; break;
      case "--draws": a.draws = Number(v); break;
      case "--out": a.out = v; break;
      case "--trail": a.trail = v; break;
      case "--cost": a.cost = Number(v); break;
      default: throw new Error(`Unknown flag ${flag}`);
    }
  }
  for (const k of ["ledger", "barCache", "since", "out"]) if (!a[k]) throw new Error(`--${k} is required`);
  if (Number.isNaN(Date.parse(a.since))) throw new Error("--since must be a date");
  if (!(Number.isInteger(a.draws) && a.draws >= 1)) throw new Error("--draws must be a whole number >= 1");
  if (a.trail !== "weeklySwing" && a.trail !== "eachWeek") throw new Error("--trail must be weeklySwing or eachWeek");
  if (!(Number.isFinite(a.cost) && a.cost >= 0)) throw new Error("--cost must be a number >= 0");
  return a;
}

/** Each symbol's full series from a verified 1Day bar cache, with execution bars from `since`. */
async function readSeries(dir, since) {
  const manifest = JSON.parse(await readFile(path.join(dir, "manifest.json"), "utf8"));
  if (manifest.complete !== true) throw new Error("Bar cache manifest is not marked complete");
  const seen = new Set();
  const sinceMs = Date.parse(since);
  const out = new Map();
  for (const name of await readdir(dir)) {
    if (!name.endsWith(".json") || name === "manifest.json") continue;
    if (name.split("__")[1]?.replace(/\.json$/, "") !== "1Day") throw new Error(`Bar cache file ${name} is not a 1Day series`);
    const text = await readFile(path.join(dir, name), "utf8");
    if (manifest.files?.[name] !== createHash("sha256").update(text).digest("hex")) throw new Error(`Bar cache file ${name} does not match its manifest entry`);
    const s = JSON.parse(text);
    const symbol = name.split("__")[0];
    if (out.has(symbol)) throw new Error(`Bar cache holds two 1Day series for ${symbol}`);
    seen.add(name);
    const bars = (s.bars ?? []).filter((b) => Date.parse(b.t) >= sinceMs);
    out.set(symbol, { bars, daily: s.daily ?? [], monthly: s.monthlyYearCount ?? s.monthly });
  }
  const missing = Object.keys(manifest.files ?? {}).filter((n) => !seen.has(n));
  if (missing.length) throw new Error(`Bar cache is missing ${missing.length} file(s) its manifest lists, e.g. ${missing[0]}`);
  return out;
}

const med = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : "NOT MEASURED";
};
const f = (x) => (x === null || x === undefined || Number.isNaN(x) ? "NOT MEASURED" : Number(x).toFixed(3));

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const server = await createServer({ configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true }, appType: "custom", logLevel: "warn" });
  try {
    const { runCoreControl } = await server.ssrLoadModule("/lib/backtest/coreControl.ts");
    const buf = await readFile(path.resolve(root, args.ledger));
    const ledger = JSON.parse((args.ledger.endsWith(".gz") ? gunzipSync(buf) : buf).toString("utf8"));
    const longs = ledger.filter((t) => (t.side ?? (t.direction === "bearish" ? "short" : "long")) === "long");
    const series = await readSeries(path.resolve(root, args.barCache), args.since);
    const started = Date.now();
    const res = runCoreControl(series, longs, args.draws, { trail: args.trail, costPerShare: args.cost });
    const minutes = (Date.now() - started) / 60_000;
    const md = [
      "# Core control: random entries through the core's own exits",
      "",
      `Ledger \`${args.ledger}\` (${longs.length} long campaigns, ${res.realN} with cached bars). ${args.draws} seeded draws, ±21 sessions, same stop share, the core's ${args.trail} trail and trend exits, pyramid and $${args.cost}/share cost. ${minutes.toFixed(1)} minutes.`,
      "",
      "| Measure | Value |",
      "|---|---:|",
      `| Real mean R | ${f(res.realMean)} |`,
      `| Control mean R (core exits, random entries) p5 / p50 / p95 | ${f(res.control.p05)} / ${f(res.control.p50)} / ${f(res.control.p95)} |`,
      `| Share of draws at or above the real mean | ${(res.control.shareAtOrAboveReal * 100).toFixed(1)}% |`,
      `| Fixed hold on the pyramid-off run's own entries, one lot p5 / p50 / p95 | ${f(res.fixedHold.p05)} / ${f(res.fixedHold.p50)} / ${f(res.fixedHold.p95)} |`,
      `| Exit value (core exits alone, pyramid off − fixed hold) p5 / p50 / p95 | ${f(res.exitValue.p05)} / ${f(res.exitValue.p50)} / ${f(res.exitValue.p95)} |`,
      `| Share of draws where the core's exits did no better than a fixed hold | ${(res.exitValue.shareAtOrBelowZero * 100).toFixed(1)}% |`,
      `| Pyramid value (with − without, same drawn sessions; entries taken can differ) p5 / p50 / p95 | ${f(res.pyramidValue.p05)} / ${f(res.pyramidValue.p50)} / ${f(res.pyramidValue.p95)} |`,
      `| Share of draws where the pyramid did no better | ${(res.pyramidValue.shareAtOrBelowZero * 100).toFixed(1)}% |`,
      `| Campaigns a draw took, median: pyramid on / off / fixed holds | ${med(res.draws.map((d) => d.campaigns))} / ${med(res.draws.map((d) => d.noPyramidCampaigns))} / ${med(res.draws.map((d) => d.fixedHoldN))} of ${res.draws[0]?.drawn ?? 0} drawn |`,
      `| Draws dropped on a session collision, median | ${med(res.draws.map((d) => d.collisions))} |`,
      `| Campaigns with a window narrowed at a series edge | ${res.draws[0]?.narrowed ?? "NOT MEASURED"} |`,
      "",
      "A drawn session is skipped when the core is already in a campaign or the monthly trend is against it, so a draw holds fewer campaigns than the ledger. Membership is applied only through the real entries' dates. The fixed hold is one lot with no adds; the exit value compares it with the core's exits with the pyramid off, and the pyramid value is measured separately on the same drawn sessions (the entries taken can differ). A real campaign within 21 sessions of the series' start or end gets a narrower window, down to its own session; those are counted.",
      "",
    ].join("\n");
    const out = path.resolve(root, args.out);
    await mkdir(out, { recursive: true });
    await writeFile(path.join(out, "core-control.json"), JSON.stringify({ args, ...res }, null, 2) + "\n");
    await writeFile(path.join(out, "core-control.md"), md);
    process.stdout.write(md);
  } finally {
    await server.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    process.stderr.write(`${err instanceof Error ? err.stack : String(err)}\n`);
    process.exitCode = 1;
  });
}

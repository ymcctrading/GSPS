/**
 * Runs the replay harness over a whole universe (e.g. all ~766 symbols of
 * `LARGE_CAP_UNIVERSE`) and compares several harness configurations
 * ("cells") on the *same* fetched bars.
 *
 * Why this exists: `GET /api/backtest` caps a request at 12 symbols to stay
 * inside Vercel Hobby's 60s function limit, so a full-universe comparison meant
 * dozens of hand-pasted URLs. This runs the same code — `fetchSeries`, `replay`,
 * `combine`, `buildReport` — in one process with no function timeout (locally,
 * or from `.github/workflows/backtest-universe.yml`), fetching each symbol once
 * and replaying every cell against those bars, so the cells differ only in the
 * options under test.
 *
 * Usage:
 *   node scripts/backtest-universe.mjs --universe large-cap --out tmp/run \
 *     --cells '[{"label":"baseline","options":{"useProductionStop":true}},
 *               {"label":"confirmed","options":{"useProductionStop":true,"requireEntryConfirmation":true}}]'
 *
 *   --universe      large-cap | mega-12 | diversified | mega-cap | SYM1,SYM2,…
 *   --cells         JSON array (or a path to a .json file) of
 *                   { label, options?, within? }. `options` is passed straight
 *                   to `replay()` / the report request.
 *   --timeframe     execution timeframe (default 15Min)
 *   --targetR       default 2
 *   --since         ISO timestamp; replay only bars at or after it
 *   --limit         only the first N symbols of the universe (smoke tests)
 *   --symbolsPerMinute  pacing (default 30 ≈ 60 vendor requests/min). The
 *                   production scans share the same Alpaca account (~200
 *                   requests/min). Leave headroom during market hours.
 *   --allowSynthetic  permit the seeded-random-walk provider (tests only;
 *                   the output is marked and must never be published)
 *
 * Refuses to run on synthetic data unless told to, for the same reason
 * `scripts/replay-report.mjs` does: a full table of numbers describing a
 * random walk is how a placeholder once became a published finding.
 *
 * An unknown `options` key is silently ignored by `replay()`. So if two
 * cells with different options produce identical trades, the summary says so
 * loudly — it usually means the option doesn't exist on the checked-out ref.
 */

import { createServer } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The 12 mega-cap names behind the 2026-09-23 committed run. */
export const MEGA_12 = ["SPY", "AAPL", "AMD", "TSLA", "MSFT", "NVDA", "GOOGL", "META", "AMZN", "NFLX", "AVGO", "CRM"];

export const DEFAULT_CELLS = [{ label: "baseline", options: { useProductionStop: true } }];

export function parseArgs(argv) {
  const args = {
    universe: "large-cap",
    cells: null,
    out: null,
    timeframe: "15Min",
    targetR: 2,
    since: null,
    limit: null,
    symbolsPerMinute: 30,
    allowSynthetic: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const eq = argv[i].indexOf("=");
    const flag = eq === -1 ? argv[i] : argv[i].slice(0, eq);
    if (flag === "--allowSynthetic") {
      args.allowSynthetic = true;
      continue;
    }
    const value = eq === -1 ? argv[++i] : argv[i].slice(eq + 1);
    if (value === undefined) throw new Error(`Missing value for ${flag}`);
    switch (flag) {
      case "--universe": args.universe = value; break;
      case "--cells": args.cells = value; break;
      case "--out": args.out = value; break;
      case "--timeframe": args.timeframe = value; break;
      case "--targetR": args.targetR = Number(value); break;
      case "--since": args.since = value; break;
      case "--limit": args.limit = Number(value); break;
      case "--symbolsPerMinute": args.symbolsPerMinute = Number(value); break;
      default: throw new Error(`Unknown flag ${flag}`);
    }
  }
  if (!args.out) throw new Error("--out <dir> is required");
  if (!(args.targetR > 0)) throw new Error("--targetR must be positive");
  if (args.limit !== null && !(args.limit > 0)) throw new Error("--limit must be positive");
  if (!(args.symbolsPerMinute >= 0)) throw new Error("--symbolsPerMinute must be >= 0 (0 = unpaced)");
  return args;
}

/** Validate a parsed cells array: unique, filesystem-safe labels. */
export function validateCells(cells) {
  if (!Array.isArray(cells) || cells.length === 0) throw new Error("--cells must be a non-empty JSON array");
  const seen = new Set();
  for (const c of cells) {
    if (!c || typeof c.label !== "string" || !/^[A-Za-z0-9._-]+$/.test(c.label)) {
      throw new Error(`Each cell needs a filesystem-safe "label" (got ${JSON.stringify(c?.label)})`);
    }
    if (seen.has(c.label)) throw new Error(`Duplicate cell label "${c.label}"`);
    seen.add(c.label);
    if (c.options !== undefined && (typeof c.options !== "object" || Array.isArray(c.options))) {
      throw new Error(`Cell "${c.label}": "options" must be an object`);
    }
  }
  return cells;
}

/** Deterministic PRNG so a committed run's CIs are reproducible. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mean = (xs) => (xs.length === 0 ? 0 : xs.reduce((s, x) => s + x, 0) / xs.length);

/** Percentile bootstrap CI for the mean of `values`. Null below 2 samples. */
export function bootstrapMeanCI(values, { resamples = 5000, alpha = 0.05, seed = 20260925 } = {}) {
  if (values.length < 2) return null;
  const rand = mulberry32(seed);
  const means = new Float64Array(resamples);
  for (let r = 0; r < resamples; r++) {
    let s = 0;
    for (let i = 0; i < values.length; i++) s += values[Math.floor(rand() * values.length)];
    means[r] = s / values.length;
  }
  means.sort();
  const lo = means[Math.floor((alpha / 2) * resamples)];
  const hi = means[Math.min(resamples - 1, Math.ceil((1 - alpha / 2) * resamples) - 1)];
  return [lo, hi];
}

/** Bootstrap CI for mean(a) − mean(b), resampling each side independently. */
export function bootstrapDiffCI(a, b, { resamples = 5000, alpha = 0.05, seed = 20260926 } = {}) {
  if (a.length < 2 || b.length < 2) return null;
  const rand = mulberry32(seed);
  const diffs = new Float64Array(resamples);
  for (let r = 0; r < resamples; r++) {
    let sa = 0;
    for (let i = 0; i < a.length; i++) sa += a[Math.floor(rand() * a.length)];
    let sb = 0;
    for (let i = 0; i < b.length; i++) sb += b[Math.floor(rand() * b.length)];
    diffs[r] = sa / a.length - sb / b.length;
  }
  diffs.sort();
  return [
    diffs[Math.floor((alpha / 2) * resamples)],
    diffs[Math.min(resamples - 1, Math.ceil((1 - alpha / 2) * resamples) - 1)],
  ];
}

/** n, expectancy with CI, win rate, profit factor, and both time halves. */
export function describeTrades(trades) {
  const rs = trades.map((t) => t.rMultiple);
  const wins = rs.filter((r) => r > 0);
  const losses = rs.filter((r) => r <= 0);
  const grossWin = wins.reduce((s, r) => s + r, 0);
  const grossLoss = -losses.reduce((s, r) => s + r, 0);
  const sorted = [...trades].sort((x, y) => (x.openedAt < y.openedAt ? -1 : x.openedAt > y.openedAt ? 1 : 0));
  const half = Math.floor(sorted.length / 2);
  const firstHalf = sorted.slice(0, half).map((t) => t.rMultiple);
  const secondHalf = sorted.slice(half).map((t) => t.rMultiple);
  return {
    n: trades.length,
    expectancyR: mean(rs),
    expectancyCI95: bootstrapMeanCI(rs),
    winRate: trades.length === 0 ? 0 : trades.filter((t) => t.outcome === "win").length / trades.length,
    profitFactor: grossLoss === 0 ? (grossWin > 0 ? null : 0) : grossWin / grossLoss,
    totalR: rs.reduce((s, r) => s + r, 0),
    halves: {
      first: { n: firstHalf.length, expectancyR: mean(firstHalf), from: sorted[0]?.openedAt ?? null },
      second: { n: secondHalf.length, expectancyR: mean(secondHalf), from: sorted[half]?.openedAt ?? null },
    },
  };
}

const SCOPES = {
  Execute: (t) => t.outputState === "Execute",
  Watch: (t) => t.outputState === "Watch",
  all: () => true,
};

/** A fingerprint of a cell's trades, to catch options the ref silently ignored. */
function tradeSignature(trades) {
  return trades.map((t) => `${t.symbol}|${t.openedAt}|${t.entry}|${t.rMultiple.toFixed(6)}`).join(";");
}

/**
 * Per-cell stats, pairwise differences against the first cell, and a warning
 * for any two cells whose options differ but whose trades are identical.
 */
export function summarizeCells(cellResults) {
  const cells = cellResults.map(({ cell, trades }) => ({
    label: cell.label,
    options: cell.options ?? {},
    scopes: Object.fromEntries(Object.entries(SCOPES).map(([k, f]) => [k, describeTrades(trades.filter(f))])),
  }));

  const reference = cellResults[0];
  const differencesVsFirst = cellResults.slice(1).map(({ cell, trades }) => ({
    label: cell.label,
    against: reference.cell.label,
    scopes: Object.fromEntries(
      Object.entries(SCOPES).map(([k, f]) => {
        const a = trades.filter(f).map((t) => t.rMultiple);
        const b = reference.trades.filter(f).map((t) => t.rMultiple);
        return [k, { diffR: mean(a) - mean(b), diffCI95: bootstrapDiffCI(a, b) }];
      }),
    ),
  }));

  const warnings = [];
  for (let i = 0; i < cellResults.length; i++) {
    for (let j = i + 1; j < cellResults.length; j++) {
      const a = cellResults[i];
      const b = cellResults[j];
      const sameOptions = JSON.stringify(a.cell.options ?? {}) === JSON.stringify(b.cell.options ?? {});
      if (!sameOptions && a.trades.length > 0 && tradeSignature(a.trades) === tradeSignature(b.trades)) {
        warnings.push(
          `Cells "${a.cell.label}" and "${b.cell.label}" have different options but identical trades — ` +
            `an option is probably not implemented on this ref (replay() ignores unknown keys).`,
        );
      }
    }
  }
  return { cells, differencesVsFirst, warnings };
}

const fmtR = (x) => (x === null || x === undefined || Number.isNaN(x) ? "—" : `${x >= 0 ? "+" : ""}${x.toFixed(3)}R`);
const fmtCI = (ci) => (ci ? `[${fmtR(ci[0])}, ${fmtR(ci[1])}]` : "—");
const fmtPct = (x) => `${(x * 100).toFixed(1)}%`;

export function summaryMarkdown(meta, summary) {
  const lines = [];
  lines.push(`# Universe backtest — ${meta.universe} (${meta.symbolsUsed}/${meta.symbolsRequested} symbols)`);
  lines.push("");
  lines.push(
    `Ref \`${meta.ref}\` @ \`${meta.sha}\` · ${meta.timeframe} · ${meta.targetR}R target · ` +
      `source **${meta.source}**${meta.live ? "" : " (SYNTHETIC — do not publish)"} · ` +
      `window ${meta.window.from ?? "—"} → ${meta.window.to ?? "—"} · generated ${meta.generatedAt}`,
  );
  lines.push("");
  if (summary.warnings.length > 0) {
    lines.push("## Warnings");
    for (const w of summary.warnings) lines.push(`- ${w}`);
    lines.push("");
  }
  for (const scope of Object.keys(SCOPES)) {
    lines.push(`## ${scope === "all" ? "All trades (unconditioned)" : `${scope} bucket`}`);
    lines.push("");
    lines.push("| Cell | n | Expectancy | 95% CI | Win rate | PF | 1st half | 2nd half |");
    lines.push("|---|---:|---:|---|---:|---:|---:|---:|");
    for (const c of summary.cells) {
      const s = c.scopes[scope];
      lines.push(
        `| ${c.label} | ${s.n} | ${fmtR(s.expectancyR)} | ${fmtCI(s.expectancyCI95)} | ${fmtPct(s.winRate)} | ` +
          `${s.profitFactor === null ? "∞" : s.profitFactor.toFixed(2)} | ${fmtR(s.halves.first.expectancyR)} (n=${s.halves.first.n}) | ` +
          `${fmtR(s.halves.second.expectancyR)} (n=${s.halves.second.n}) |`,
      );
    }
    for (const d of summary.differencesVsFirst) {
      const s = d.scopes[scope];
      lines.push("");
      lines.push(`${d.label} − ${d.against}: ${fmtR(s.diffR)}, 95% CI ${fmtCI(s.diffCI95)}`);
    }
    lines.push("");
  }
  lines.push("Cell options:");
  for (const c of summary.cells) lines.push(`- **${c.label}**: \`${JSON.stringify(c.options)}\``);
  if (meta.skipped.length > 0) {
    lines.push("");
    lines.push(`Skipped ${meta.skipped.length} symbol(s) — see \`summary.json\`.`);
  }
  lines.push("");
  return lines.join("\n");
}

async function resolveUniverse(server, name) {
  if (name === "mega-12") return MEGA_12;
  const mod = await server.ssrLoadModule("/lib/scan/large-cap-universe.ts");
  const named = {
    "large-cap": "LARGE_CAP_UNIVERSE",
    diversified: "DIVERSIFIED_BACKTEST_SAMPLE",
    "mega-cap": "MEGA_CAP_UNIVERSE",
  }[name];
  if (named) {
    if (!Array.isArray(mod[named])) throw new Error(`${named} does not exist on this ref`);
    return mod[named];
  }
  const list = name.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (list.length === 0) throw new Error("--universe is empty");
  return list;
}

function isRegularSessionNow(now = new Date()) {
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = et.getDay();
  const minutes = et.getHours() * 60 + et.getMinutes();
  return day >= 1 && day <= 5 && minutes >= 9 * 60 + 30 && minutes < 16 * 60;
}

function gitInfo() {
  const sha = process.env.GITHUB_SHA ?? safeExec("git rev-parse HEAD");
  const ref = process.env.BACKTEST_REF ?? process.env.GITHUB_REF_NAME ?? safeExec("git rev-parse --abbrev-ref HEAD");
  return { sha: sha ?? "unknown", ref: ref ?? "unknown" };
}

function safeExec(cmd) {
  try {
    return execSync(cmd, { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return null;
  }
}

async function loadCells(value) {
  if (value === null) return DEFAULT_CELLS;
  const text = value.trim().startsWith("[") ? value : await readFile(path.resolve(root, value), "utf8");
  return validateCells(JSON.parse(text));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cells = await loadCells(args.cells);

  const server = await createServer({
    configFile: false,
    root,
    resolve: { alias: { "@": root } },
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "warn",
  });

  try {
    const run = await server.ssrLoadModule("/lib/backtest/run.ts");
    const { replay, combine } = await server.ssrLoadModule("/lib/backtest/replay.ts");
    const { getMarketDataProvider } = await server.ssrLoadModule("/lib/data/provider.ts");
    if (typeof run.buildReport !== "function") {
      throw new Error("lib/backtest/run.ts has no buildReport on this ref — merge main into it first.");
    }

    const provider = getMarketDataProvider();
    if (!provider.isLive && !args.allowSynthetic) {
      throw new Error(
        `Market data provider is "${provider.name}" (not live). Set MARKET_DATA_PROVIDER=alpaca and ` +
          `ALPACA_API_KEY/ALPACA_API_SECRET. Refusing to produce numbers from synthetic bars.`,
      );
    }

    let universe = await resolveUniverse(server, args.universe);
    if (args.limit !== null) universe = universe.slice(0, args.limit);
    if (provider.isLive && isRegularSessionNow() && args.symbolsPerMinute > 30) {
      process.stderr.write(
        `WARNING: US market is open and pacing is ${args.symbolsPerMinute} symbols/min. The live scans share ` +
          `this Alpaca account's rate limit — prefer <=30/min in session.\n`,
      );
    }

    const sinceMs = args.since === null ? null : Date.parse(args.since);
    if (sinceMs !== null && Number.isNaN(sinceMs)) throw new Error(`Invalid --since ${args.since}`);

    const perCell = cells.map(() => []);
    const used = [];
    const skipped = [];
    let from = null;
    let to = null;
    const started = Date.now();
    const paceMs = args.symbolsPerMinute > 0 ? 60_000 / args.symbolsPerMinute : 0;

    for (let i = 0; i < universe.length; i++) {
      const symbol = universe[i];
      const tickStart = Date.now();
      try {
        const { bars: fetched, daily } = await run.fetchSeries(symbol, args.timeframe);
        const bars = sinceMs === null ? fetched : fetched.filter((b) => Date.parse(b.t) >= sinceMs);
        if (bars.length === 0) {
          skipped.push({ symbol, reason: "no execution-timeframe bars" });
        } else {
          if (from === null || bars[0].t < from) from = bars[0].t;
          if (to === null || bars[bars.length - 1].t > to) to = bars[bars.length - 1].t;
          cells.forEach((cell, c) => {
            perCell[c].push(replay(symbol, bars, { targetR: args.targetR, ...(cell.options ?? {}), dailyBars: daily }));
          });
          used.push(symbol);
        }
      } catch (err) {
        skipped.push({ symbol, reason: err instanceof Error ? err.message : String(err) });
      }
      if ((i + 1) % 25 === 0 || i === universe.length - 1) {
        const mins = ((Date.now() - started) / 60_000).toFixed(1);
        process.stderr.write(`[${i + 1}/${universe.length}] ${symbol} — ${used.length} used, ${skipped.length} skipped, ${mins} min\n`);
      }
      const wait = paceMs - (Date.now() - tickStart);
      if (wait > 0 && i < universe.length - 1) await new Promise((r) => setTimeout(r, wait));
    }

    if (used.length === 0) throw new Error(`No symbol produced bars (${skipped.length} skipped). Nothing written.`);

    await mkdir(path.resolve(root, args.out), { recursive: true });
    const window = { from, to };
    const cellResults = [];
    for (let c = 0; c < cells.length; c++) {
      const cell = cells[c];
      const overall = combine(perCell[c]);
      const outcome = {
        source: provider.name,
        live: provider.isLive,
        timeframe: args.timeframe,
        targetR: args.targetR,
        symbols: used,
        skipped,
        window,
        overall,
      };
      const report = run.buildReport(outcome, {
        symbols: used,
        timeframe: args.timeframe,
        targetR: args.targetR,
        attributeWithin: cell.within ?? "Execute",
        ...(cell.options ?? {}),
      });
      await writeFile(path.resolve(root, args.out, `${cell.label}.report.json`), JSON.stringify({ cell, ...report }));
      await writeFile(path.resolve(root, args.out, `${cell.label}.trades.json`), JSON.stringify(overall.trades));
      cellResults.push({ cell, trades: overall.trades });
    }

    const { sha, ref } = gitInfo();
    const meta = {
      universe: args.universe,
      symbolsRequested: universe.length,
      symbolsUsed: used.length,
      skipped,
      ref,
      sha,
      timeframe: args.timeframe,
      targetR: args.targetR,
      since: args.since,
      source: provider.name,
      live: provider.isLive,
      window,
      generatedAt: new Date().toISOString(),
      durationMinutes: (Date.now() - started) / 60_000,
    };
    const summary = summarizeCells(cellResults);
    await writeFile(path.resolve(root, args.out, "summary.json"), JSON.stringify({ meta, ...summary }, null, 2));
    const md = summaryMarkdown(meta, summary);
    await writeFile(path.resolve(root, args.out, "summary.md"), md);
    process.stdout.write(md);
    for (const w of summary.warnings) process.stderr.write(`WARNING: ${w}\n`);
  } finally {
    await server.close();
  }
}

// Only when run as a command, so the pure helpers can be imported by tests
// without spinning up Vite or touching a vendor.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    process.stderr.write(`${err instanceof Error ? err.stack : String(err)}\n`);
    process.exitCode = 1;
  });
}

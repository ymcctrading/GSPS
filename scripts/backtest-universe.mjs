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
 * `options.disableExits` (measurement only, `ReplayOptions.disableExits`)
 * switches named Gann exit rules off inside the walk, e.g.
 * `{"exitRule":"gann","disableExits":["three_adverse_closes"]}`. Every name
 * is checked against `GANN_EXIT_RULE_NAMES` before any symbol is fetched, and
 * an unknown one stops the run.
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
import { gzipSync } from "node:zlib";

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
function describeCore(trades) {
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

/** A trade still open when the data ended (`exitReason: "open_at_end"`): its R is marked to market, not realised. */
export const isOpenAtEnd = (t) => t.exitReason === "open_at_end";

/**
 * `describeCore`, plus how many trades were still open when the data ended and
 * the same stats without them (`closed`, halves included). Trades held to the
 * 10-session limit stay in it, marked at that close, so it is "excluding
 * data-end only", not a realised-only figure.
 * Gann's exits cut losers early, so the open trades are mostly winners and
 * the scope's own expectancy reads above what its closed trades realised.
 */
export function describeTrades(trades) {
  return {
    ...describeCore(trades),
    openAtEnd: trades.filter(isOpenAtEnd).length,
    closed: describeCore(trades.filter((t) => !isOpenAtEnd(t))),
  };
}

// Reversals and re-entries after a stop (`derived`) were never scored: they
// count in "all" and in their own scope, never in a verdict bucket.
const SCOPES = {
  Execute: (t) => !t.derived && t.outputState === "Execute",
  Watch: (t) => !t.derived && t.outputState === "Watch",
  all: () => true,
  derived: (t) => Boolean(t.derived),
};

/**
 * The scored trades by whole score, so one cell gives every band (a band per
 * cell outran the workflow's time limit on a six-year run). Derived trades
 * carry no score and are left out, as in the verdict buckets.
 */
export function scoreBands(trades) {
  const scored = trades.filter((t) => !t.derived && typeof t.score === "number");
  const scores = [...new Set(scored.map((t) => Math.round(t.score)))].sort((a, b) => a - b);
  return scores.map((score) => ({ score, ...describeTrades(scored.filter((t) => Math.round(t.score) === score)) }));
}

/** A fingerprint of a cell's trades, to catch options the ref silently ignored. */
function tradeSignature(trades) {
  return trades.map((t) => `${t.symbol}|${t.openedAt}|${t.entry}|${t.rMultiple.toFixed(6)}`).join(";");
}

/**
 * Per-cell stats, pairwise differences against the first cell, and a warning
 * for any two cells whose options differ but whose trades are identical.
 */
export function summarizeCells(cellResults) {
  const cells = cellResults.map(({ cell, trades, accounting }) => ({
    label: cell.label,
    options: cell.options ?? {},
    scopes: Object.fromEntries(Object.entries(SCOPES).map(([k, f]) => [k, describeTrades(trades.filter(f))])),
    scoreBands: scoreBands(trades),
    ...(accounting ? { accounting } : {}),
  }));

  const reference = cellResults[0];
  const differencesVsFirst = cellResults.slice(1).map(({ cell, trades }) => ({
    label: cell.label,
    against: reference.cell.label,
    scopes: Object.fromEntries(
      Object.entries(SCOPES).map(([k, f]) => {
        const a = trades.filter(f).map((t) => t.rMultiple);
        const b = reference.trades.filter(f).map((t) => t.rMultiple);
        const closed = (ts) => ts.filter((t) => f(t) && !isOpenAtEnd(t)).map((t) => t.rMultiple);
        const ca = closed(trades);
        const cb = closed(reference.trades);
        return [
          k,
          {
            diffR: mean(a) - mean(b),
            diffCI95: bootstrapDiffCI(a, b),
            closed: { diffR: mean(ca) - mean(cb), diffCI95: bootstrapDiffCI(ca, cb) },
          },
        ];
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
const fmtPF = (x) => (x === null ? "∞" : x.toFixed(2));

/** Columns of the per-trade CSV printed to the job log (`tradesCsv`). */
export const TRADE_CSV_COLUMNS = [
  "cell",
  "symbol",
  "entryTime",
  "exitTime",
  "side",
  "score",
  "bucket",
  "setupKind",
  "entryKind",
  "exitReason",
  "barsHeld",
  "R",
  "derived",
  "entryPrice",
  "initialStop",
  "crossedLevel",
  "exitPrice",
];

const priceField = (v) => (typeof v === "number" && Number.isFinite(v) ? v : "");

const csvField = (v) => {
  const text = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/**
 * One row per trade for every cell, so a session that can read only the job
 * log can still run exact splits. `bucket` is the verdict (`unscored` for an
 * armed trade the score could not reach, empty for a derived one). A trade
 * that left on the bracket's stop or target has no `exitReason` of its own,
 * so it reads `bracket_stop` or `bracket_target`. `entryPrice` is the fill,
 * `initialStop` the stop it opened with, `crossedLevel` the plan's old level
 * (the top or bottom crossed, or the double or triple bottom bought; empty for
 * a held entry and a derived trade), and `exitPrice` where the last shares
 * left, or the close a timeout was marked at.
 */
export function tradesCsv(cellResults) {
  const rows = [TRADE_CSV_COLUMNS.join(",")];
  for (const { cell, trades } of cellResults) {
    for (const t of trades) {
      const exitReason = t.exitReason ?? (t.outcome === "win" ? "bracket_target" : t.outcome === "loss" ? "bracket_stop" : "");
      rows.push(
        [
          cell.label,
          t.symbol,
          t.openedAt,
          t.closedAt ?? "",
          t.direction === "bearish" ? "short" : "long",
          typeof t.score === "number" ? t.score : "",
          t.derived ? "" : (t.outputState ?? "unscored"),
          t.setupKind ?? "",
          t.entryKind ?? "",
          exitReason,
          t.barsHeld,
          Number.isFinite(t.rMultiple) ? t.rMultiple.toFixed(4) : "",
          t.derived ?? "",
          priceField(t.entry),
          priceField(t.stop),
          priceField(t.crossedLevel),
          priceField(t.exitPrice),
        ]
          .map(csvField)
          .join(","),
      );
    }
  }
  return rows.join("\n") + "\n";
}

/** Above this the CSV is printed gzipped and base64-encoded, so the job log stays usable. */
export const TRADE_CSV_LOG_LIMIT_BYTES = 2_000_000;
const BASE64_LINE = 1000;

/**
 * The CSV as a block for the job log, between BEGIN/END markers like the
 * workflow's summary.json. Over `limitBytes` it is gzipped and base64-encoded
 * in lines of 1,000 characters, and the marker says so
 * (`trades.csv.gz.base64`: strip each line's log prefix, join, base64-decode,
 * gunzip).
 */
export function tradesCsvLogBlock(csv, limitBytes = TRADE_CSV_LOG_LIMIT_BYTES) {
  if (Buffer.byteLength(csv, "utf8") <= limitBytes) {
    return `=== BEGIN trades.csv ===\n${csv}=== END trades.csv ===\n`;
  }
  const encoded = gzipSync(Buffer.from(csv, "utf8")).toString("base64");
  const lines = [];
  for (let i = 0; i < encoded.length; i += BASE64_LINE) lines.push(encoded.slice(i, i + BASE64_LINE));
  return `=== BEGIN trades.csv.gz.base64 ===\n${lines.join("\n")}\n=== END trades.csv.gz.base64 ===\n`;
}

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
    lines.push(
      `## ${scope === "all" ? "All trades (unconditioned)" : scope === "derived" ? "Reversals and re-entries (derived, unscored)" : `${scope} bucket`}`,
    );
    lines.push("");
    lines.push("| Cell | n | Expectancy | 95% CI | Win rate | PF | 1st half | 2nd half |");
    lines.push("|---|---:|---:|---|---:|---:|---:|---:|");
    for (const c of summary.cells) {
      const s = c.scopes[scope];
      lines.push(
        `| ${c.label} | ${s.n} | ${fmtR(s.expectancyR)} | ${fmtCI(s.expectancyCI95)} | ${fmtPct(s.winRate)} | ` +
          `${fmtPF(s.profitFactor)} | ${fmtR(s.halves.first.expectancyR)} (n=${s.halves.first.n}) | ` +
          `${fmtR(s.halves.second.expectancyR)} (n=${s.halves.second.n}) |`,
      );
    }
    lines.push("");
    // The same scope without the trades still open when the data ended: what was realised.
    lines.push("Closed trades only (still open at the data's end left out; their R is marked to market):");
    lines.push("");
    lines.push("| Cell | Open at end | Closed n | Expectancy | 95% CI | Win rate | PF | 1st half | 2nd half |");
    lines.push("|---|---:|---:|---:|---|---:|---:|---:|---:|");
    for (const c of summary.cells) {
      const s = c.scopes[scope];
      const k = s.closed;
      if (!k) continue;
      lines.push(
        `| ${c.label} | ${s.openAtEnd ?? 0} | ${k.n} | ${fmtR(k.expectancyR)} | ${fmtCI(k.expectancyCI95)} | ${fmtPct(k.winRate)} | ` +
          `${fmtPF(k.profitFactor)} | ${fmtR(k.halves.first.expectancyR)} (n=${k.halves.first.n}) | ` +
          `${fmtR(k.halves.second.expectancyR)} (n=${k.halves.second.n}) |`,
      );
    }
    for (const d of summary.differencesVsFirst) {
      const s = d.scopes[scope];
      lines.push("");
      lines.push(`${d.label} − ${d.against}: ${fmtR(s.diffR)}, 95% CI ${fmtCI(s.diffCI95)}`);
      if (s.closed) lines.push(`${d.label} − ${d.against}, closed only: ${fmtR(s.closed.diffR)}, 95% CI ${fmtCI(s.closed.diffCI95)}`);
    }
    lines.push("");
  }
  if (summary.cells.some((c) => (c.scoreBands ?? []).length > 0)) {
    lines.push("## Score bands (scored trades by whole score)");
    lines.push("");
    lines.push("| Cell | Score | n | Expectancy | 95% CI | Win rate | 1st half | 2nd half | Open at end | Closed n | Closed expectancy | Closed 95% CI |");
    lines.push("|---|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---|");
    for (const c of summary.cells) {
      for (const s of c.scoreBands ?? []) {
        lines.push(
          `| ${c.label} | ${s.score} | ${s.n} | ${fmtR(s.expectancyR)} | ${fmtCI(s.expectancyCI95)} | ${fmtPct(s.winRate)} | ` +
            `${fmtR(s.halves.first.expectancyR)} (n=${s.halves.first.n}) | ${fmtR(s.halves.second.expectancyR)} (n=${s.halves.second.n}) | ` +
            `${s.openAtEnd ?? 0} | ${s.closed?.n ?? "—"} | ${fmtR(s.closed?.expectancyR)} | ${fmtCI(s.closed?.expectancyCI95)} |`,
        );
      }
    }
    lines.push("");
  }
  if (summary.cells.some((c) => c.accounting)) {
    // Every fired entry is a trade, a refused fill or a dropped plan.
    lines.push("## Fill accounting");
    lines.push("");
    lines.push("| Cell | Triggered | Refused fills | Dropped plans | no levels | no risk | TP1 not beyond entry | round number |");
    lines.push("|---|---:|---:|---:|---:|---:|---:|---:|");
    for (const c of summary.cells) {
      const a = c.accounting;
      if (!a) continue;
      const r = a.droppedPlanReasons ?? {};
      lines.push(
        `| ${c.label} | ${a.triggered} | ${a.refusedFills} | ${a.droppedPlans} | ${r.noLevels ?? 0} | ${r.invalidRisk ?? 0} | ` +
          `${r.targetNotBeyondEntry ?? 0} | ${r.roundNumberHold ?? 0} |`,
      );
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
  // The F4 calendar test rides this workflow (see scripts/calendar-test.mjs).
  if (process.argv.includes("calendar-test")) {
    const { runCalendarTest } = await import("./calendar-test.mjs");
    await runCalendarTest({});
    await mkdir(path.join(root, "out"), { recursive: true });
    await writeFile(path.join(root, "out", "summary.md"), "Calendar test: see the job log.\n");
    // The workflow's print step reads summary.json; the result itself is in the job log.
    await writeFile(path.join(root, "out", "summary.json"), JSON.stringify({ note: "Calendar test: see the job log." }) + "\n");
    return;
  }
  // The item 7 time-window base-rate test rides it too (scripts/time-window-base-rates.mjs).
  if (process.argv.includes("time-window-base-rates")) {
    const { runTimeWindowBaseRates } = await import("./time-window-base-rates.mjs");
    await runTimeWindowBaseRates({});
    await mkdir(path.join(root, "out"), { recursive: true });
    await writeFile(path.join(root, "out", "summary.md"), "Time-window base rates: see the job log.\n");
    // The workflow's print step reads summary.json; the result itself is in the job log.
    await writeFile(path.join(root, "out", "summary.json"), JSON.stringify({ note: "Time-window base rates: see the job log." }) + "\n");
    return;
  }

  // The Q33/Q38/Q40 pre-registered research tests ride it too (scripts/preregistered-time-tests.mjs).
  if (process.argv.includes("preregistered-time-tests")) {
    const { runPreregisteredTimeTests } = await import("./preregistered-time-tests.mjs");
    await runPreregisteredTimeTests({});
    await mkdir(path.join(root, "out"), { recursive: true });
    await writeFile(path.join(root, "out", "summary.md"), "Pre-registered time tests: see the job log.\n");
    await writeFile(path.join(root, "out", "summary.json"), JSON.stringify({ note: "Pre-registered time tests: see the job log." }) + "\n");
    return;
  }

  // The intraday alert replay rides it too (scripts/intraday-alerts.mjs); `since` is unused, `limit` caps the universe.
  if (process.argv.includes("intraday-alerts")) {
    const { runIntradayAlerts } = await import("./intraday-alerts.mjs");
    const limitAt = process.argv.indexOf("--limit");
    const paceAt = process.argv.indexOf("--symbolsPerMinute");
    // The universe run's pacing is in symbols, about two vendor requests each.
    const symbolsPerMinute = paceAt === -1 ? 30 : Number(process.argv[paceAt + 1]);
    await runIntradayAlerts({
      days: 60,
      limit: limitAt === -1 ? null : Number(process.argv[limitAt + 1]),
      requestsPerMinute: symbolsPerMinute > 0 ? symbolsPerMinute * 2 : 0,
    });
    await mkdir(path.join(root, "out"), { recursive: true });
    await writeFile(path.join(root, "out", "summary.md"), "Intraday alert replay: see the job log.\n");
    await writeFile(path.join(root, "out", "summary.json"), JSON.stringify({ note: "Intraday alert replay: see the job log." }) + "\n");
    return;
  }

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
    const { replayIntraday } = await server.ssrLoadModule("/lib/backtest/replayIntraday.ts");
    const { getMarketDataProvider } = await server.ssrLoadModule("/lib/data/provider.ts");
    if (typeof run.buildReport !== "function") {
      throw new Error("lib/backtest/run.ts has no buildReport on this ref — merge main into it first.");
    }
    // Measurement-only exit switches: check every cell's names before any fetch.
    const { resolveDisableExits } = await server.ssrLoadModule("/lib/backtest/replay.ts");
    for (const cell of cells) {
      const names = cell.options?.disableExits;
      if (names === undefined) continue;
      if (typeof resolveDisableExits !== "function") {
        throw new Error(`Cell "${cell.label}": disableExits is not supported on this ref.`);
      }
      try {
        resolveDisableExits(names, cell.options?.exitRule ?? "bracket");
        if (cell.options?.profile === "intraday" && names.length > 0) {
          throw new Error("disableExits applies to the swing profile's exit rules, not the intraday profile");
        }
      } catch (err) {
        throw new Error(`Cell "${cell.label}": ${err instanceof Error ? err.message : String(err)}`);
      }
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

    // Shares outstanding and inception dates (parity roadmap D2, D3), read
    // once, as `collectRun` does. Older refs have no loader; the readings are
    // then absent, as they are without SUPABASE_SERVICE_ROLE_KEY.
    let references = new Map();
    try {
      const refs = await server.ssrLoadModule("/lib/data/instrumentReference.ts");
      if (typeof refs.loadInstrumentReferenceHistory === "function") {
        references = await refs.loadInstrumentReferenceHistory(universe);
      }
    } catch {
      // Not on this ref.
    }
    process.stderr.write(`Stored filings facts for ${references.size}/${universe.length} symbols.\n`);

    const perCell = cells.map(() => []);
    const used = [];
    const skipped = [];
    let from = null;
    let to = null;
    const started = Date.now();
    const paceMs = args.symbolsPerMinute > 0 ? 60_000 / args.symbolsPerMinute : 0;

    // The market's bars (SPY) once: its daily for Gann's early/late leaders
    // (G25), its monthly to date the bull and bear markets (weak stocks,
    // A-TIME-06).
    let market;
    try {
      market = await run.fetchSeries("SPY", args.timeframe, true);
    } catch {
      market = undefined;
    }
    // The scan universe's monthly bars once, for Gann's relative strength rank
    // (S6, P3(c)). Older refs have no loader; the rank is then unread.
    const universeStrength = typeof run.fetchReplayUniverseStrength === "function" ? await run.fetchReplayUniverseStrength() : null;
    process.stderr.write(`Universe strength rank: ${universeStrength ? `${universeStrength.size} months` : "unread"}.\n`);

    for (let i = 0; i < universe.length; i++) {
      const symbol = universe[i];
      const tickStart = Date.now();
      try {
        const series = await run.fetchSeries(symbol, args.timeframe, true);
        const fetched = series.bars;
        const bars = sinceMs === null ? fetched : fetched.filter((b) => Date.parse(b.t) >= sinceMs);
        if (bars.length === 0) {
          skipped.push({ symbol, reason: "no execution-timeframe bars" });
        } else {
          if (from === null || bars[0].t < from) from = bars[0].t;
          if (to === null || bars[bars.length - 1].t > to) to = bars[bars.length - 1].t;
          const ref = references.get(symbol.toUpperCase());
          const instrument = ref ? { sharesHistory: ref.history, inception: ref.reference.inception, name: ref.reference.name ?? null } : undefined;
          cells.forEach((cell, c) => {
            // `profile: "intraday"` is the replay-only intraday profile
            // (lib/backtest/replayIntraday.ts); every other cell is the production method.
            const opts = cell.options ?? {};
            perCell[c].push(
              opts.profile === "intraday"
                ? replayIntraday(symbol, bars, {
                    ...(opts.costPerShare !== undefined ? { costPerShare: opts.costPerShare } : {}),
                    ...(opts.reclaimPoints !== undefined ? { reclaimPoints: opts.reclaimPoints } : {}),
                    dailyBars: series.daily,
                  })
                : replay(symbol, bars, { targetR: args.targetR, ...opts, ...run.replaySeriesOptions(series, market, universeStrength), instrument }),
            );
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
      cellResults.push({
        cell,
        trades: overall.trades,
        accounting: {
          triggered: overall.triggered,
          refusedFills: overall.refusedFills ?? 0,
          droppedPlans: overall.droppedPlans ?? 0,
          droppedPlanReasons: overall.droppedPlanReasons ?? null,
        },
      });
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
    // The per-trade rows, for exact splits from the job log alone.
    const csv = tradesCsv(cellResults);
    await writeFile(path.resolve(root, args.out, "trades.csv"), csv);
    process.stdout.write(`\n${tradesCsvLogBlock(csv)}`);
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

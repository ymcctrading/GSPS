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
 *   --universe      large-cap | point-in-time | mega-12 | diversified | mega-cap | SYM1,SYM2,…
 *                   point-in-time: each year's own large caps, the departed
 *                   included, read from `--since` (or the daily window's start)
 *                   to today (`lib/universe/pointInTime.ts`). A stock opens
 *                   trades only in the years it was a member, and the strength
 *                   rank's peers are that month's members. --offset and --limit
 *                   slice the member list, which every job builds the same way.
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
 * `{"exitRule":"structure","disableExits":["three_adverse_closes"]}`. Every name
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
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { robustnessSections } from "./robustness-report.mjs";
import { ladderLogBlock } from "./rule-ladder.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Write through a temporary file and rename, so a job killed mid-checkpoint
 * never leaves a truncated file behind. */
async function writeWhole(file, text) {
  await writeFile(`${file}.tmp`, text);
  await rename(`${file}.tmp`, file);
}

/** The 12 mega-cap names behind the 2026-09-23 committed run. */
export const MEGA_12 = ["SPY", "AAPL", "AMD", "TSLA", "MSFT", "NVDA", "GOOGL", "META", "AMZN", "NFLX", "AVGO", "CRM"];

/** Symbols between partial write-outs (see `writeResults`). */
export const CHECKPOINT_EVERY = 50;

const LEGACY_EXIT_RULES = { gann: "structure", "gann-runner": "structure-runner" };

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
    offset: 0,
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
      case "--offset": args.offset = Number(value); break;
      case "--symbolsPerMinute": args.symbolsPerMinute = Number(value); break;
      default: throw new Error(`Unknown flag ${flag}`);
    }
  }
  if (!args.out) throw new Error("--out <dir> is required");
  if (!(args.targetR > 0)) throw new Error("--targetR must be positive");
  if (args.limit !== null && !(args.limit > 0)) throw new Error("--limit must be positive");
  if (!(Number.isInteger(args.offset) && args.offset >= 0)) throw new Error("--offset must be a whole number >= 0");
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
    // The exit rules' ids before 2026-10-28 ("gann", "gann-runner"); earlier
    // runs and notes still name them.
    if (c.options && Object.hasOwn(LEGACY_EXIT_RULES, c.options.exitRule)) c.options.exitRule = LEGACY_EXIT_RULES[c.options.exitRule];
    // The intraday profile's own options, rejected on the swing profile as the route rejects them.
    const intradayOnly = ["sessionClose", "scaleOut", "reactionEntry", "sessionPlans"].filter((k) => c.options?.[k] !== undefined);
    if (intradayOnly.length > 0 && c.options?.profile !== "intraday") {
      throw new Error(`Cell "${c.label}": ${intradayOnly.join(", ")} apply to profile "intraday" only`);
    }
    const coreOnly = ["coreShorts", "coreTrail", "ladder", "ladderGate"].filter((k) => c.options?.[k] !== undefined);
    if (coreOnly.length > 0 && c.options?.profile !== "core") {
      throw new Error(`Cell "${c.label}": ${coreOnly.join(", ")} apply to profile "core" only`);
    }
    // The rule ladder (docs/RULE_LADDER.md): "tag" reads every rung without
    // gating and prints the ladder; `ladderGate` gates on the kept rungs.
    if (c.options?.ladder !== undefined && c.options.ladder !== "tag") throw new Error(`Cell "${c.label}": ladder must be "tag"`);
    if (
      c.options?.ladderGate !== undefined &&
      !(Array.isArray(c.options.ladderGate) && c.options.ladderGate.length > 0 && c.options.ladderGate.every((n) => typeof n === "string" && !n.startsWith("ref:")))
    ) {
      throw new Error(`Cell "${c.label}": ladderGate must be a non-empty array of rung names (references are never gated on)`);
    }
    if (c.options?.ladder !== undefined && c.options?.ladderGate !== undefined) throw new Error(`Cell "${c.label}": ladder and ladderGate are exclusive`);
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

/**
 * Each scored check and context factor, pass against fail, over all scored
 * trades and within Execute (2026-10-28). The job log's factor table was
 * Execute only, conditioned on a 7+ score, and kept no all-trade reading; at
 * about 2,100 Execute trades a pass/fail delta's standard error was near 0.06R,
 * so no listed inversion could be told from noise. The interval is the normal
 * approximation (a bootstrap per factor over tens of thousands of trades would
 * outrun the job). An absent key is "not evaluated", never a fail.
 */
export const FACTOR_SCOPES = {
  scored: (t) => !t.derived && typeof t.score === "number",
  Execute: SCOPES.Execute,
};

function sampleStats(xs) {
  const n = xs.length;
  const m = mean(xs);
  const v = n < 2 ? 0 : xs.reduce((s, x) => s + (x - m) ** 2, 0) / (n - 1);
  return { n, m, v };
}

export function factorTable(trades) {
  const out = {};
  for (const [scope, keep] of Object.entries(FACTOR_SCOPES)) {
    const groups = new Map();
    for (const t of trades) {
      if (!keep(t)) continue;
      for (const [source, rec] of [["criterion", t.criteria], ["context", t.contextFactors]]) {
        for (const [key, passed] of Object.entries(rec ?? {})) {
          if (typeof passed !== "boolean") continue;
          const id = `${source}:${key}`;
          if (!groups.has(id)) groups.set(id, { source, key, pass: [], fail: [] });
          groups.get(id)[passed ? "pass" : "fail"].push(t.rMultiple);
        }
      }
    }
    out[scope] = [...groups.values()]
      .map(({ source, key, pass, fail }) => {
        const a = sampleStats(pass);
        const b = sampleStats(fail);
        const se = a.n >= 2 && b.n >= 2 ? Math.sqrt(a.v / a.n + b.v / b.n) : null;
        const diffR = a.n > 0 && b.n > 0 ? a.m - b.m : null;
        return {
          source,
          key,
          passN: a.n,
          failN: b.n,
          passR: a.n > 0 ? a.m : null,
          failR: b.n > 0 ? b.m : null,
          // Sample variances, so slices of one run can be pooled.
          passVar: a.v,
          failVar: b.v,
          diffR,
          diffCI95: se !== null && diffR !== null ? [diffR - 1.96 * se, diffR + 1.96 * se] : null,
        };
      })
      .sort((x, y) => (x.source === y.source ? (x.key < y.key ? -1 : 1) : x.source === "criterion" ? -1 : 1));
  }
  return out;
}

/**
 * How the trades left and how they came in, over all scored trades and within
 * Execute (2026-10-28). The six-year daily run's Execute trades won 29% of the
 * time, lost 0.49R on average against a 1R risk and were held a median 5
 * sessions, so most of them left on one of Gann's exit signals rather than the
 * stop; its summary kept no split by exit or entry, so which signal ended them
 * could not be read without the job log. Intervals are the normal
 * approximation, as in the factor table.
 */
export const EXIT_REASON_OF = (t) =>
  t.exitReason ?? (t.outcome === "win" ? "bracket_target" : t.outcome === "loss" ? "bracket_stop" : "none");

export function splitTable(trades, keyOf) {
  const out = {};
  for (const [scope, keep] of Object.entries(FACTOR_SCOPES)) {
    const groups = new Map();
    for (const t of trades) {
      if (!keep(t)) continue;
      const key = keyOf(t) || "none";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(t);
    }
    out[scope] = [...groups.entries()]
      .map(([key, ts]) => {
        const { n, m, v } = sampleStats(ts.map((t) => t.rMultiple));
        const half = n >= 2 ? 1.96 * Math.sqrt(v / n) : null;
        const bars = ts.map((t) => t.barsHeld).filter((b) => Number.isFinite(b)).sort((a, b) => a - b);
        return {
          key,
          n,
          expectancyR: m,
          expectancyCI95: half === null ? null : [m - half, m + half],
          winRate: ts.filter((t) => t.outcome === "win").length / n,
          medianBarsHeld: bars.length ? bars[Math.floor(bars.length / 2)] : null,
          // Sample variance, so slices of one run can be pooled.
          variance: v,
        };
      })
      .sort((a, b) => b.n - a.n || (a.key < b.key ? -1 : 1));
  }
  return out;
}

/** A fingerprint of a cell's trades, to catch options the ref silently ignored. */
function tradeSignature(trades) {
  return trades.map((t) => `${t.symbol}|${t.openedAt}|${t.entry}|${t.rMultiple.toFixed(6)}`).join(";");
}

// The Monte Carlo scopes match the report's (`BacktestReport.monteCarlo`):
// the scored (armed) trades, each verdict bucket, and the derived trades on their own.
export const MONTE_CARLO_SCOPES = {
  armed: (t) => !t.derived,
  Execute: SCOPES.Execute,
  Watch: SCOPES.Watch,
  derived: SCOPES.derived,
};

/**
 * Per-cell stats, pairwise differences against the first cell, and a warning
 * for any two cells whose options differ but whose trades are identical.
 * `monteCarlo` is `lib/backtest/monteCarlo.ts#monteCarloResample`, passed in
 * because this file loads lib code through vite; without it the key is left
 * out. `robustness` is likewise a function of a cell's trades returning
 * `lib/backtest/robustness.ts#buildRobustness`'s report (walk-forward, stress
 * windows, market regimes); without it that key is left out too.
 */
export function summarizeCells(cellResults, { monteCarlo, robustness } = {}) {
  const cells = cellResults.map(({ cell, trades, accounting }) => ({
    label: cell.label,
    options: cell.options ?? {},
    scopes: Object.fromEntries(Object.entries(SCOPES).map(([k, f]) => [k, describeTrades(trades.filter(f))])),
    scoreBands: scoreBands(trades),
    factors: factorTable(trades),
    exits: splitTable(trades, EXIT_REASON_OF),
    entries: splitTable(trades, (t) => t.entryKind),
    ...(monteCarlo
      ? {
          monteCarlo: Object.fromEntries(
            Object.entries(MONTE_CARLO_SCOPES).map(([k, f]) => [k, monteCarlo(trades.filter(f))]),
          ),
        }
      : {}),
    ...(robustness ? { robustness: robustness(trades) } : {}),
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

/** A tagged core cell's campaigns as ladder rows (`lib/backtest/walkForward.ts#LadderRow`). */
export function ladderRowsFromCore(trades) {
  return trades
    .filter((t) => Array.isArray(t.rulesRefused) && Number.isFinite(t.rMultiple))
    .map((t) => ({ symbol: t.symbol, date: t.openedAt.slice(0, 10), r: t.rMultiple, refused: new Set(t.rulesRefused) }));
}

/**
 * The bare core's campaign figures for one cell (`summariseCore`), as a
 * Markdown section for the job log: the whole line beside the first lot alone,
 * so the pyramid's share shows, and the split by side and entry.
 */
export function coreCampaignSummary(label, core) {
  const r = (x) => (Number.isFinite(x) ? (x >= 0 ? "+" : "") + x.toFixed(3) + "R" : "n/a");
  const lines = [
    "",
    `## Core campaigns: ${label}`,
    "",
    `Campaigns ${core.campaigns} (${core.pyramided} pyramided, ${core.meanLots.toFixed(2)} lots on average). ` +
      `Whole line ${r(core.lineExpectancyR)} a campaign (total ${core.lineR.toFixed(1)}R); first lot alone ${r(core.firstLotExpectancyR)} ` +
      `(total ${core.firstLotR.toFixed(1)}R). Closed campaigns only: ${core.closed.campaigns} at ${r(core.closed.lineExpectancyR)}.`,
    "",
    "| Split | Campaigns | Whole line | First lot |",
    "|---|---:|---:|---:|",
    `| Long | ${core.bySide.long.campaigns} | ${r(core.bySide.long.lineExpectancyR)} | ${r(core.bySide.long.firstLotExpectancyR)} |`,
    `| Short | ${core.bySide.short.campaigns} | ${r(core.bySide.short.lineExpectancyR)} | ${r(core.bySide.short.firstLotExpectancyR)} |`,
    `| Crossing | ${core.byEntry.crossing.campaigns} | ${r(core.byEntry.crossing.lineExpectancyR)} | |`,
    `| Reaction | ${core.byEntry.reaction.campaigns} | ${r(core.byEntry.reaction.lineExpectancyR)} | |`,
    "",
  ];
  return lines.join("\n");
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
  if (meta.partial) {
    lines.push(
      `**Partial: a checkpoint after ${meta.symbolsDone} of ${meta.symbolsRequested} symbols.** ` +
        "The job stopped before the end, so these figures cover only the symbols replayed so far.",
    );
    lines.push("");
  }
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
  if (summary.cells.some((c) => c.factors)) {
    lines.push("## Factor table (pass − fail, scored trades and within Execute)");
    lines.push("");
    lines.push("Intervals are the normal approximation. A factor whose interval spans 0 is not told from noise.");
    lines.push("");
    lines.push("| Cell | Factor | Pass n | Fail n | Pass − fail | 95% CI | Execute pass n | Execute pass − fail | Execute 95% CI |");
    lines.push("|---|---|---:|---:|---:|---|---:|---:|---|");
    for (const c of summary.cells) {
      if (!c.factors) continue;
      const exec = new Map((c.factors.Execute ?? []).map((f) => [`${f.source}:${f.key}`, f]));
      for (const f of c.factors.scored ?? []) {
        const e = exec.get(`${f.source}:${f.key}`);
        lines.push(
          `| ${c.label} | ${f.source === "context" ? "ctx " : ""}${f.key} | ${f.passN} | ${f.failN} | ${fmtR(f.diffR)} | ${fmtCI(f.diffCI95)} | ` +
            `${e?.passN ?? "—"} | ${fmtR(e?.diffR)} | ${fmtCI(e?.diffCI95)} |`,
        );
      }
    }
    lines.push("");
  }
  for (const [field, title] of [
    ["exits", "Exit reasons"],
    ["entries", "Entry kinds"],
  ]) {
    if (!summary.cells.some((c) => c[field])) continue;
    lines.push(`## ${title} (scored trades and within Execute)`);
    lines.push("");
    lines.push("| Cell | Scope | Kind | n | Expectancy | 95% CI | Win rate | Median bars held |");
    lines.push("|---|---|---|---:|---:|---|---:|---:|");
    for (const c of summary.cells) {
      for (const scope of Object.keys(FACTOR_SCOPES)) {
        for (const r of c[field]?.[scope] ?? []) {
          lines.push(
            `| ${c.label} | ${scope} | ${r.key} | ${r.n} | ${fmtR(r.expectancyR)} | ${fmtCI(r.expectancyCI95)} | ` +
              `${fmtPct(r.winRate)} | ${r.medianBarsHeld ?? "—"} |`,
          );
        }
      }
    }
    lines.push("");
  }
  if (summary.cells.some((c) => c.monteCarlo)) {
    lines.push("## Monte Carlo resampling (closed trades, blocks in open-time order)");
    lines.push("");
    lines.push(
      "5th / 50th / 95th percentiles over resampled sequences of the same trades. Blocks of consecutive trades " +
        "keep losing stretches together. Trades still open at the data's end are left out.",
    );
    lines.push("");
    lines.push(
      "| Cell | Scope | n | Block | Expectancy p5 / p50 / p95 | Share ≤ 0 | Max drawdown run / p50 / p95 | Longest losing streak run / p50 / p95 |",
    );
    lines.push("|---|---|---:|---:|---|---:|---|---|");
    const fmtDD = (x) => `${x.toFixed(1)}R`;
    for (const c of summary.cells) {
      for (const scope of Object.keys(MONTE_CARLO_SCOPES)) {
        const m = c.monteCarlo?.[scope];
        if (!m) continue;
        lines.push(
          `| ${c.label} | ${scope} | ${m.n} | ${m.blockLength} | ${fmtR(m.expectancyR.p5)} / ${fmtR(m.expectancyR.p50)} / ${fmtR(m.expectancyR.p95)} | ` +
            `${fmtPct(m.shareNonPositiveExpectancy)} | ${fmtDD(m.observed.maxDrawdownR)} / ${fmtDD(m.maxDrawdownR.p50)} / ${fmtDD(m.maxDrawdownR.p95)} | ` +
            `${m.observed.longestLosingStreak} / ${m.longestLosingStreak.p50} / ${m.longestLosingStreak.p95} |`,
        );
      }
    }
    lines.push("");
  }
  if (summary.cells.some((c) => c.robustness)) {
    lines.push("## Robustness (walk-forward, stress windows, market regimes)");
    lines.push("");
    for (const c of summary.cells) {
      if (!c.robustness) continue;
      lines.push(`### ${c.label}`, "", ...robustnessSections(c.robustness, "####"), "");
    }
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
    // The bare core (profile "core"); absent on refs before it.
    const { replayCore } = await server.ssrLoadModule("/lib/backtest/replayCore.ts").catch(() => ({}));
    const usesLadder = cells.some((c) => c.options?.ladder !== undefined || c.options?.ladderGate !== undefined);
    const ladderMod = usesLadder ? await server.ssrLoadModule("/lib/backtest/ruleLadder.ts") : null;
    const walkForward = usesLadder ? await server.ssrLoadModule("/lib/backtest/walkForward.ts") : null;
    // Check every gated rung name before any fetch.
    for (const c of cells) if (c.options?.ladderGate) ladderMod.ladderRules("CHECK", { dailyBars: [] }, c.options.ladderGate);
    if (cells.some((c) => c.options?.profile === "core")) {
      if (typeof replayCore !== "function") throw new Error('profile "core" is not on this ref.');
      if (args.timeframe !== "1Day") throw new Error('profile "core" walks daily bars: run it with --timeframe 1Day.');
    }
    const { getMarketDataProvider } = await server.ssrLoadModule("/lib/data/provider.ts");
    const { monteCarloResample } = await server.ssrLoadModule("/lib/backtest/monteCarlo.ts");
    const { buildRobustness } = await server.ssrLoadModule("/lib/backtest/robustness.ts");
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
        resolveDisableExits(names, cell.options?.exitRule ?? "structure");
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

    const sinceMs = args.since === null ? null : Date.parse(args.since);
    if (sinceMs !== null && Number.isNaN(sinceMs)) throw new Error(`Invalid --since ${args.since}`);

    // The point-in-time universe (survivorship): each year's members, read
    // once before the slice so every job of a split run reads the same list.
    let pit = null;
    if (args.universe === "point-in-time") {
      const intraday = cells.filter((c) => c.options?.profile === "intraday").map((c) => c.label);
      if (intraday.length > 0) {
        throw new Error(`The point-in-time universe is read by the swing replay only (cells ${intraday.join(", ")} use the intraday profile).`);
      }
      const pitMod = await server.ssrLoadModule("/lib/backtest/pointInTime.ts");
      const { LARGE_CAP_UNIVERSE } = await server.ssrLoadModule("/lib/scan/large-cap-universe.ts");
      const { describePointInTimeUniverse, isPointInTimeMember } = await server.ssrLoadModule("/lib/universe/pointInTime.ts");
      const refs = await server.ssrLoadModule("/lib/data/instrumentReference.ts");
      const todayRefs = await refs.loadInstrumentReferenceHistory(LARGE_CAP_UNIVERSE);
      // A fixed start, so every job of a split run reads the same years.
      if (sinceMs === null) throw new Error("--universe point-in-time needs --since, so every job of a split run reads the same list.");
      const fromDate = new Date(sinceMs).toISOString().slice(0, 10);
      const loaded = await pitMod.loadPointInTimeUniverse({
        from: fromDate,
        to: new Date().toISOString().slice(0, 10),
        todayShares: new Map([...todayRefs].map(([s, r]) => [s, r.history])),
      });
      pit = { ...loaded, isMember: (symbol, date) => isPointInTimeMember(loaded.universe, symbol, date) };
      process.stderr.write(`Point-in-time universe from ${fromDate}: ${pit.symbols.length} symbols were members in at least one year.\n`);
      for (const line of describePointInTimeUniverse(pit.universe)) process.stderr.write(`  ${line}\n`);
      process.stderr.write(
        `  Member list hash ${pit.hash} (every job of a split run must print the same). ` +
          `Departed tickers with share counts: ${pit.departedWithShares}.\n`,
      );
      if (pit.suspectBars.length > 0) process.stderr.write(`  Departed tickers whose bars may not be their company's: ${pit.suspectBars.join(", ")}\n`);
      if (pit.suspectSplits.length > 0) process.stderr.write(`  Today's names reading under half the floor now (a split after the last filing?): ${pit.suspectSplits.join(", ")}\n`);
    }

    let universe = pit ? pit.symbols : await resolveUniverse(server, args.universe);
    // --offset and --limit take a slice of the universe, so a run too long
    // for one job can be split across several (0-382, then 383-765).
    universe = universe.slice(args.offset, args.limit === null ? undefined : args.offset + args.limit);
    if (provider.isLive && isRegularSessionNow() && args.symbolsPerMinute > 30) {
      process.stderr.write(
        `WARNING: US market is open and pacing is ${args.symbolsPerMinute} symbols/min. The live scans share ` +
          `this Alpaca account's rate limit — prefer <=30/min in session.\n`,
      );
    }

    // Shares outstanding and inception dates (parity roadmap D2, D3), read
    // once, as `collectRun` does. Older refs have no loader; the readings are
    // then absent. Without SUPABASE_SECRET_KEY they come from the checked-in
    // snapshot (lib/data/instrumentReferenceSnapshot.json).
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
    const universeStrength = pit
      ? pit.strength
      : typeof run.fetchReplayUniverseStrength === "function"
        ? await run.fetchReplayUniverseStrength()
        : null;
    process.stderr.write(`Universe strength rank: ${universeStrength ? `${universeStrength.size} months` : "unread"}.\n`);

    // Writes every result file. Called as a checkpoint every
    // CHECKPOINT_EVERY symbols (marked partial) as well as at the end, so a
    // job that reaches its time limit still leaves the symbols it finished
    // in out/ for the always() steps to print and upload.
    const writeResults = async (partial, done) => {
      await mkdir(path.resolve(root, args.out), { recursive: true });
      const window = { from, to };
      const cellResults = [];
      const coreSections = [];
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
          includeMonteCarlo: true,
          ...(cell.options ?? {}),
        });
        await writeWhole(path.resolve(root, args.out, `${cell.label}.report.json`), JSON.stringify({ cell, ...report }));
        if (report.core) coreSections.push(coreCampaignSummary(cell.label, report.core));
        await writeWhole(path.resolve(root, args.out, `${cell.label}.trades.json`), JSON.stringify(overall.trades));
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
        ...(pit
          ? {
              pointInTime: {
                candidates: pit.universe.candidates.length,
                hash: pit.hash,
                departedWithShares: pit.departedWithShares,
                suspectBars: pit.suspectBars,
                suspectSplits: pit.suspectSplits,
                members: Object.fromEntries(pit.universe.years.map((y) => [y, [...pit.universe.members.values()].filter((ys) => ys.has(y)).length])),
                duplicates: Object.fromEntries(pit.universe.duplicates),
              },
            }
          : {}),
        symbolsRequested: universe.length,
        symbolsUsed: used.length,
        skipped,
        ref,
        sha,
        timeframe: args.timeframe,
        targetR: args.targetR,
        since: args.since,
        offset: args.offset,
        limit: args.limit,
        source: provider.name,
        live: provider.isLive,
        window,
        partial,
        symbolsDone: done,
        generatedAt: new Date().toISOString(),
        durationMinutes: (Date.now() - started) / 60_000,
      };
      // The robustness sections take seconds a cell on a long run, so a
      // checkpoint leaves them out and the final write carries them. The
      // regime split reads SPY's daily bars, fetched once above; without them
      // it is left out.
      const summary = summarizeCells(cellResults, {
        monteCarlo: monteCarloResample,
        ...(partial ? {} : { robustness: (trades) => buildRobustness(trades, market?.daily) }),
      });
      await writeWhole(path.resolve(root, args.out, "summary.json"), JSON.stringify({ meta, ...summary }, null, 2));
      const md = summaryMarkdown(meta, summary) + coreSections.join("");
      await writeWhole(path.resolve(root, args.out, "summary.md"), md);
      // The per-trade rows, for exact splits from the job log alone. A
      // checkpoint keeps the log block on disk (the "Print results" step
      // prints it when the job stops early); the final write prints it here.
      // The rule ladder's campaign rows, checkpoints included, so a cut-off job
      // still leaves them for scripts/rule-ladder.mjs.
      for (const { cell, trades } of cellResults) {
        if (cell.options?.ladder === "tag") await writeWhole(path.resolve(root, args.out, `${cell.label}.ladder-rows.csv`), walkForward.ladderRowsCsv(ladderRowsFromCore(trades)));
      }
      const csv = tradesCsv(cellResults);
      await writeWhole(path.resolve(root, args.out, "trades.csv"), csv);
      const block = tradesCsvLogBlock(csv);
      const blockFile = path.resolve(root, args.out, "trades.partial-log.txt");
      if (partial) {
        await writeWhole(blockFile, block);
        return;
      }
      await rm(blockFile, { force: true });
      process.stdout.write(md);
      process.stdout.write(`\n${block}`);
      // The rule ladder last, so a tail read of the log reaches it.
      for (const { cell, trades } of cellResults) {
        if (cell.options?.ladder !== "tag") continue;
        process.stdout.write(`\nRule ladder, cell ${cell.label}:\n${ladderLogBlock(walkForward, ladderMod, ladderRowsFromCore(trades))}`);
      }
      for (const w of summary.warnings) process.stderr.write(`WARNING: ${w}\n`);
    };

    for (let i = 0; i < universe.length; i++) {
      const symbol = universe[i];
      const tickStart = Date.now();
      try {
        const series = await run.fetchSeries(symbol, args.timeframe, true, pit?.asOf.get(symbol));
        const fetched = series.bars;
        const bars = sinceMs === null ? fetched : fetched.filter((b) => Date.parse(b.t) >= sinceMs);
        if (bars.length === 0) {
          skipped.push({ symbol, reason: "no execution-timeframe bars" });
        } else {
          if (from === null || bars[0].t < from) from = bars[0].t;
          if (to === null || bars[bars.length - 1].t > to) to = bars[bars.length - 1].t;
          const ref = references.get(symbol.toUpperCase());
          const departed = !ref && pit?.shares.get(symbol.toUpperCase());
          const instrument = ref
            ? { sharesHistory: ref.history, inception: ref.reference.inception, name: ref.reference.name ?? null }
            : departed
              ? { sharesHistory: departed, inception: null, name: null }
              : undefined;
          const membership = pit ? { inUniverse: (date) => pit.isMember(symbol, date) } : {};
          cells.forEach((cell, c) => {
            // `profile: "intraday"` is the replay-only intraday profile
            // (lib/backtest/replayIntraday.ts); every other cell is the production method.
            const opts = cell.options ?? {};
            perCell[c].push(
              opts.profile === "core"
                ? replayCore(symbol, bars, {
                    dailyBars: series.daily,
                    monthlyBars: series.monthlyYearCount ?? series.monthly,
                    ...(opts.costPerShare !== undefined ? { costPerShare: opts.costPerShare } : {}),
                    ...(opts.pyramid !== undefined ? { pyramid: opts.pyramid } : {}),
                    ...(opts.coreShorts !== undefined ? { shorts: opts.coreShorts } : {}),
                    ...(opts.coreTrail !== undefined ? { trail: opts.coreTrail } : {}),
                    ...membership,
                    ...(opts.ladder === "tag" || opts.ladderGate
                      ? {
                          rules: ladderMod.ladderRules(
                            symbol,
                            { ...run.replaySeriesOptions(series, market, universeStrength), instrument },
                            opts.ladderGate ?? ladderMod.LADDER_RULE_NAMES,
                          ),
                          ruleMode: opts.ladder === "tag" ? "tag" : "gate",
                        }
                      : {}),
                  })
                : opts.profile === "intraday"
                ? replayIntraday(symbol, bars, {
                    ...(opts.costPerShare !== undefined ? { costPerShare: opts.costPerShare } : {}),
                    ...(opts.reclaimPoints !== undefined ? { reclaimPoints: opts.reclaimPoints } : {}),
                    // The intraday profile's own options (Part 5.2 and 5.4 of
                    // docs/GANN_SETUP_LIFECYCLE_INTRADAY_TIMELINE.md); before
                    // 2026-10-28 this path dropped them, so only the route ran them.
                    ...(opts.sessionClose === true ? { sessionClose: true } : {}),
                    ...(opts.scaleOut === false ? { scaleOut: false } : {}),
                    ...(opts.reactionEntry === true ? { reactionEntry: true } : {}),
                    ...(opts.sessionPlans === true ? { sessionPlans: true } : {}),
                    dailyBars: series.daily,
                  })
                : replay(symbol, bars, { targetR: args.targetR, ...opts, ...run.replaySeriesOptions(series, market, universeStrength), instrument, ...membership }),
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
      if ((i + 1) % CHECKPOINT_EVERY === 0 && i < universe.length - 1 && used.length > 0) await writeResults(true, i + 1);
      const wait = paceMs - (Date.now() - tickStart);
      if (wait > 0 && i < universe.length - 1) await new Promise((r) => setTimeout(r, wait));
    }

    if (used.length === 0) throw new Error(`No symbol produced bars (${skipped.length} skipped). Nothing written.`);
    await writeResults(false, universe.length);
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

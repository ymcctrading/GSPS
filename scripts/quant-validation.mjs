/**
 * Quant validation of one or more replay ledgers (slice 1): trade-level R with
 * a time-ordered block bootstrap, tail dependence, cost stress, a portfolio
 * equity view under stated risk caps, Sharpe with a selection-bias correction
 * (Deflated Sharpe), and, when frozen bars are supplied, the matched
 * random-entry control and the equal-weight benchmark.
 *
 * Usage:
 *   node scripts/quant-validation.mjs --out tmp/qv --trials 99 \
 *     --ledger longonly=/mnt/project-files/rule-ladder/2026-10-30-long-only-716/longonly.trades.json.gz \
 *     [--barCache tmp/bars] [--controlDraws 200] [--from 2020-11-02 --to 2026-10-29]
 *
 *   --ledger label=path  a `<cell>.trades.json` (or .gz) from backtest-universe.mjs; repeatable
 *   --trials N           strategy configurations tried so far (docs/experiments/registry.json
 *                        plus what it can't see); required, never defaulted
 *   --barCache dir       backtest-universe.mjs's frozen bars; enables marking to market,
 *                        the random-entry control and the benchmark
 *   --from / --to        keep only campaigns opened in this window (YYYY-MM-DD)
 *   --riskFraction, --maxOpenRiskFraction, --maxConcurrent, --maxPositionFraction  portfolio caps
 *
 * Nothing here fetches data or touches production. Every assumption the
 * numbers rest on is written into the report.
 */

import { createServer } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ANNUAL = 252;

export function parseArgs(argv) {
  const a = { ledgers: [], out: null, trials: null, barCache: null, controlDraws: 200, from: null, to: null, portfolio: {} };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const v = argv[++i];
    if (v === undefined) throw new Error(`Missing value for ${flag}`);
    switch (flag) {
      case "--ledger": {
        const eq = v.indexOf("=");
        if (eq < 1) throw new Error("--ledger takes label=path");
        a.ledgers.push({ label: v.slice(0, eq), file: v.slice(eq + 1) });
        break;
      }
      case "--out": a.out = v; break;
      case "--trials": a.trials = Number(v); break;
      case "--barCache": a.barCache = v; break;
      case "--controlDraws": a.controlDraws = Number(v); break;
      case "--from": a.from = v; break;
      case "--to": a.to = v; break;
      case "--riskFraction": case "--maxOpenRiskFraction": case "--maxConcurrent": case "--maxPositionFraction":
        a.portfolio[flag.slice(2)] = Number(v);
        break;
      default: throw new Error(`Unknown flag ${flag}`);
    }
  }
  if (!a.out) throw new Error("--out <dir> is required");
  if (a.ledgers.length === 0) throw new Error("at least one --ledger label=path is required");
  if (!(Number.isInteger(a.trials) && a.trials >= 1)) throw new Error("--trials N (a whole number >= 1, from the experiment registry) is required");
  if (!(Number.isInteger(a.controlDraws) && a.controlDraws >= 0)) throw new Error("--controlDraws must be a whole number >= 0");
  return a;
}

async function readLedger(file) {
  const buf = await readFile(file);
  const text = file.endsWith(".gz") ? gunzipSync(buf).toString("utf8") : buf.toString("utf8");
  const trades = JSON.parse(text);
  if (!Array.isArray(trades)) throw new Error(`${file} is not a trade list`);
  return trades;
}

/** Each symbol's daily bars from a bar cache (the `daily` series of its 1Day file). */
async function readBarCache(dir) {
  const bars = new Map();
  for (const name of await readdir(dir)) {
    if (!name.endsWith(".json") || name === "manifest.json") continue;
    const symbol = name.split("__")[0];
    const series = JSON.parse(await readFile(path.join(dir, name), "utf8"));
    const daily = Array.isArray(series.daily) && series.daily.length > 0 ? series.daily : series.bars;
    if (Array.isArray(daily) && (!bars.has(symbol) || daily.length > bars.get(symbol).length)) bars.set(symbol, daily);
  }
  return bars;
}

const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);

/** R after an extra cost a share, charged on the first lot's risk (adds' costs are not re-charged: a lower bound on the hit). */
export function costStressed(t, extraPerShare) {
  const risk = Math.abs(t.entry - t.stop);
  return risk > 0 ? t.rMultiple - extraPerShare / risk : t.rMultiple;
}

export function withoutTop(rs, share) {
  const sorted = [...rs].sort((a, b) => b - a);
  const k = Math.ceil(sorted.length * share);
  return { removed: k, mean: mean(sorted.slice(k)) };
}

function byYear(trades) {
  const m = new Map();
  for (const t of trades) {
    const y = t.openedAt.slice(0, 4);
    if (!m.has(y)) m.set(y, []);
    m.get(y).push(t.rMultiple);
  }
  return Object.fromEntries([...m.entries()].sort().map(([y, rs]) => [y, { n: rs.length, meanR: mean(rs) }]));
}

function annualised(stats) {
  return { sharpe: stats.sharpe * Math.sqrt(ANNUAL) };
}

function sortino(returns) {
  const m = mean(returns);
  const down = returns.map((r) => Math.min(0, r));
  const dd = Math.sqrt(down.reduce((s, x) => s + x * x, 0) / Math.max(1, returns.length - 1));
  return dd > 0 ? (m / dd) * Math.sqrt(ANNUAL) : NaN;
}

const fmt = (x, d = 3) => (x === null || x === undefined || Number.isNaN(x) ? "NOT MEASURED" : Number(x).toFixed(d));
const pct = (x, d = 1) => (x === null || x === undefined || Number.isNaN(x) ? "NOT MEASURED" : `${(x * 100).toFixed(d)}%`);

export function ledgerMarkdown(label, r) {
  const L = [];
  L.push(`## ${label}`, "");
  L.push(`Source \`${r.file}\`, ${r.trades.n} campaigns (${r.trades.closed} closed), opened ${r.trades.first} to ${r.trades.last}.`, "");
  L.push("### Per campaign (R)", "");
  L.push("| Measure | Value |", "|---|---:|");
  L.push(`| Mean R, all | ${fmt(r.trades.meanR)} |`);
  L.push(`| 95% CI, time-ordered block bootstrap (block ${r.trades.ci.block}) | [${fmt(r.trades.ci.lo)}, ${fmt(r.trades.ci.hi)}] |`);
  L.push(`| Share of resamples ≤ 0 | ${pct(r.trades.ci.shareAtOrBelowZero)} |`);
  L.push(`| Mean R, closed only | ${fmt(r.trades.closedMeanR)} |`);
  L.push(`| Win rate | ${pct(r.trades.winRate)} |`);
  L.push(`| Mean R without the top 1% (${r.trades.top1.removed} campaigns) | ${fmt(r.trades.top1.mean)} |`);
  L.push(`| Mean R without the top 5% (${r.trades.top5.removed}) | ${fmt(r.trades.top5.mean)} |`);
  L.push(`| Mean R, +$0.02/share cost | ${fmt(r.trades.cost2)} |`);
  L.push(`| Mean R, +$0.05/share cost | ${fmt(r.trades.cost5)} |`, "");
  L.push("| Year | n | Mean R |", "|---|---:|---:|");
  for (const [y, v] of Object.entries(r.trades.byYear)) L.push(`| ${y} | ${v.n} | ${fmt(v.meanR)} |`);
  L.push("", "### Portfolio", "");
  const p = r.portfolio;
  L.push("| Measure | Value |", "|---|---:|");
  L.push(`| Campaigns taken / skipped | ${p.taken} / ${Object.values(p.skipped).reduce((s, x) => s + x, 0)} (${Object.entries(p.skipped).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}) |`);
  L.push(`| Total return | ${pct(p.totalReturn)} |`);
  L.push(`| CAGR | ${pct(p.cagr)} |`);
  L.push(`| Max drawdown | ${pct(p.maxDrawdown)} (${p.maxDrawdownSessions} sessions) |`);
  L.push(`| Exposure (sessions with a campaign open) | ${pct(p.exposure)} |`);
  L.push(`| Average campaigns open | ${fmt(p.averageOpen, 1)} |`);
  L.push(`| Losing months | ${p.losingMonths} of ${p.months} |`);
  L.push(`| Sharpe (daily, ×√${ANNUAL}) | ${fmt(p.sharpeAnnual, 2)} |`);
  L.push(`| Sortino (×√${ANNUAL}) | ${fmt(p.sortinoAnnual, 2)} |`);
  L.push(`| Daily mean return, 95% CI (block ${p.dailyCI.block}) | [${fmt(p.dailyCI.lo * 1e4, 2)}, ${fmt(p.dailyCI.hi * 1e4, 2)}] bp |`);
  L.push(`| P(true Sharpe > 0) | ${pct(p.psr0)} |`);
  L.push(`| Deflated Sharpe (${r.dsr.trials} trials) | ${pct(r.dsr.dsr)} |`, "");
  L.push("Assumptions:", "");
  for (const a of p.assumptions) L.push(`- ${a}`);
  L.push(`- ${r.dsr.varianceNote}`);
  L.push("", "### Controls", "");
  if (!r.controls) {
    L.push("NOT MEASURED: no frozen bars were supplied (`--barCache`).", "");
  } else {
    const c = r.controls;
    L.push("| Measure | Value |", "|---|---:|");
    L.push(`| Random-entry control, ${c.random.draws} draws: mean R p5 / p50 / p95 | ${fmt(c.random.p05)} / ${fmt(c.random.p50)} / ${fmt(c.random.p95)} |`);
    L.push(`| Strategy mean R (matched campaigns) | ${fmt(c.random.realMean)} |`);
    L.push(`| Share of draws at or above the strategy | ${pct(c.random.shareAtOrAboveReal)} |`);
    L.push(`| Campaigns with no control match | ${c.unmatched} |`);
    L.push(`| Equal-weight benchmark CAGR / Sharpe / max drawdown | ${pct(c.benchmark.cagr)} / ${fmt(c.benchmark.sharpeAnnual, 2)} / ${pct(c.benchmark.maxDrawdown)} |`, "");
  }
  return L.join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const server = await createServer({ configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true }, appType: "custom", logLevel: "warn" });
  try {
    const sb = await server.ssrLoadModule("/lib/backtest/selectionBias.ts");
    const { simulatePortfolio } = await server.ssrLoadModule("/lib/backtest/portfolio.ts");
    const controls = await server.ssrLoadModule("/lib/backtest/controls.ts");
    const bars = args.barCache ? await readBarCache(path.resolve(root, args.barCache)) : null;
    const closes = bars ? new Map([...bars].map(([s, b]) => [s, b.map((x) => ({ t: x.t, c: x.c }))])) : undefined;

    const results = {};
    const md = [`# Quant validation report`, "", `Generated ${new Date().toISOString()} by scripts/quant-validation.mjs. ${args.trials} strategy configurations counted as tried. Window filter: ${args.from ?? "none"} to ${args.to ?? "none"}.`, ""];
    for (const { label, file } of args.ledgers) {
      let trades = (await readLedger(file)).filter((t) => Number.isFinite(t.rMultiple));
      if (args.from) trades = trades.filter((t) => t.openedAt.slice(0, 10) >= args.from);
      if (args.to) trades = trades.filter((t) => t.openedAt.slice(0, 10) <= args.to);
      trades.sort((a, b) => (a.openedAt < b.openedAt ? -1 : a.openedAt > b.openedAt ? 1 : a.symbol < b.symbol ? -1 : 1));
      const rs = trades.map((t) => t.rMultiple);
      const closed = trades.filter((t) => t.exitReason !== "open_at_end" && t.closedAt);
      const tradeStats = {
        n: trades.length,
        closed: closed.length,
        first: trades[0]?.openedAt.slice(0, 10) ?? null,
        last: trades[trades.length - 1]?.openedAt.slice(0, 10) ?? null,
        meanR: mean(rs),
        ci: sb.blockBootstrapMeanCI(rs, { resamples: 2000 }),
        closedMeanR: mean(closed.map((t) => t.rMultiple)),
        winRate: trades.length ? trades.filter((t) => t.rMultiple > 0).length / trades.length : NaN,
        top1: withoutTop(rs, 0.01),
        top5: withoutTop(rs, 0.05),
        cost2: mean(trades.map((t) => costStressed(t, 0.02))),
        cost5: mean(trades.map((t) => costStressed(t, 0.05))),
        byYear: byYear(trades),
      };
      const pf = simulatePortfolio(trades, { ...args.portfolio, ...(closes ? { closes } : {}) });
      const ds = sb.sharpeStats(pf.dailyReturns);
      // The trials' Sharpe variance is not measured (the registry holds per-trade means, not daily
      // portfolio Sharpes). Labelled assumption: under the null of no skill, a Sharpe estimate's
      // sampling variance is about 1/T, so the trials' spread is taken as that.
      const variance = ds.n > 1 ? 1 / ds.n : NaN;
      const dsr = sb.deflatedSharpe(pf.dailyReturns, args.trials, variance);
      const portfolio = {
        ...pf,
        curve: undefined,
        dailyReturns: undefined,
        months: pf.monthly.length,
        sharpeAnnual: annualised(ds).sharpe,
        sortinoAnnual: sortino(pf.dailyReturns),
        dailyCI: sb.blockBootstrapMeanCI(pf.dailyReturns, { block: 21, resamples: 2000 }),
        psr0: sb.probabilisticSharpe(ds.sharpe, 0, ds.n, ds.skew, ds.kurtosis),
      };
      let controlResult = null;
      if (bars) {
        const random = controls.randomEntryDistribution(trades, bars, args.controlDraws);
        const one = controls.randomEntryControl(trades, bars);
        const lastDay = trades.reduce((m, t) => {
          const d = (t.closedAt ?? t.openedAt).slice(0, 10);
          return d > m ? d : m;
        }, tradeStats.last ?? "");
        const bench = controls.equalWeightBenchmark(bars).filter((d) => d.date >= (tradeStats.first ?? "") && d.date <= lastDay);
        let eq = 1;
        let peak = 1;
        let mdd = 0;
        for (const d of bench) {
          eq *= 1 + d.return;
          peak = Math.max(peak, eq);
          mdd = Math.max(mdd, 1 - eq / peak);
        }
        const yrs = bench.length > 1 ? (Date.parse(bench[bench.length - 1].date) - Date.parse(bench[0].date)) / (365.25 * 86_400_000) : NaN;
        const bs = sb.sharpeStats(bench.map((d) => d.return));
        controlResult = {
          random: { ...random, means: undefined },
          unmatched: one.unmatched,
          benchmark: { sessions: bench.length, cagr: yrs > 0 ? Math.pow(eq, 1 / yrs) - 1 : NaN, sharpeAnnual: bs.sharpe * Math.sqrt(ANNUAL), maxDrawdown: mdd },
          note: "Benchmark: every stock in the bar cache, equal weight, rebalanced daily; membership is not applied (the cache holds the run's own universe).",
        };
      }
      results[label] = {
        file,
        trades: tradeStats,
        portfolio,
        dsr: { trials: args.trials, benchmarkSharpeDaily: dsr.benchmarkSharpe, dsr: dsr.dsr, varianceNote: `Deflated Sharpe: trials' Sharpe variance not measured; taken as 1/T (T = ${ds.n} sessions), the null sampling variance, a labelled assumption.` },
        controls: controlResult,
      };
      md.push(ledgerMarkdown(label, results[label]));
    }
    const out = path.resolve(root, args.out);
    await mkdir(out, { recursive: true });
    await writeFile(path.join(out, "report.json"), JSON.stringify({ args, results }, null, 2) + "\n");
    await writeFile(path.join(out, "report.md"), md.join("\n") + "\n");
    process.stdout.write(md.join("\n") + "\n");
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

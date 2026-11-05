/**
 * Edge isolation runs (owner's handoff of 2026-11-04): the pre-registered
 * experiments E2 to E8 in /mnt/project-files/private-research/quant-validation/
 * 05-preregistration-2026-11-05.md, on a run's frozen bars and ledger. Measurement
 * only; nothing is fetched and nothing touches production.
 *
 * Usage:
 *   node scripts/edge-isolation.mjs --ledger <core-long.trades.json[.gz]> --barCache <dir> \
 *     --since 2020-10-30 --out <dir> [--spy <yahoo v8 chart json>] [--draws 200] [--coreDraws 50] \
 *     [--only e2,e3,e4,e5,e6,e7b,e8]
 *
 * E1 (the reproduction) is not here: it is quant-validation.mjs run unchanged
 * at the run's own commit.
 */

import { createServer } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ALL = ["e2", "e3", "e4", "e5", "e6", "e7b", "e8"];

export function parseArgs(argv) {
  const a = { ledger: null, barCache: null, since: null, out: null, spy: null, draws: 200, coreDraws: 50, only: ALL };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const v = argv[++i];
    if (v === undefined) throw new Error(`Missing value for ${flag}`);
    switch (flag) {
      case "--ledger": a.ledger = v; break;
      case "--barCache": a.barCache = v; break;
      case "--since": a.since = v; break;
      case "--out": a.out = v; break;
      case "--spy": a.spy = v; break;
      case "--draws": a.draws = Number(v); break;
      case "--coreDraws": a.coreDraws = Number(v); break;
      case "--only": a.only = v.split(",").map((s) => s.trim().toLowerCase()); break;
      default: throw new Error(`Unknown flag ${flag}`);
    }
  }
  for (const k of ["ledger", "barCache", "since", "out"]) if (!a[k]) throw new Error(`--${k} is required`);
  if (Number.isNaN(Date.parse(a.since))) throw new Error("--since must be a date");
  for (const k of ["draws", "coreDraws"]) if (!(Number.isInteger(a[k]) && a[k] >= 1)) throw new Error(`--${k} must be a whole number >= 1`);
  for (const e of a.only) if (!ALL.includes(e)) throw new Error(`--only: unknown experiment ${e}`);
  return a;
}

/** A verified 1Day cache: every file matches its manifest hash, none is missing. */
async function readCache(dir, since) {
  const manifest = JSON.parse(await readFile(path.join(dir, "manifest.json"), "utf8"));
  if (manifest.complete !== true) throw new Error("Bar cache manifest is not marked complete");
  const sinceMs = Date.parse(since);
  const out = new Map();
  const seen = new Set();
  for (const name of await readdir(dir)) {
    if (!name.endsWith(".json") || name === "manifest.json") continue;
    if (name.split("__")[1]?.replace(/\.json$/, "") !== "1Day") throw new Error(`Bar cache file ${name} is not a 1Day series`);
    const text = await readFile(path.join(dir, name), "utf8");
    if (manifest.files?.[name] !== createHash("sha256").update(text).digest("hex")) throw new Error(`Bar cache file ${name} does not match its manifest entry`);
    seen.add(name);
    const s = JSON.parse(text);
    const symbol = name.split("__")[0];
    if (out.has(symbol)) throw new Error(`Bar cache holds two 1Day series for ${symbol}`);
    const daily = Array.isArray(s.daily) && s.daily.length > 0 ? s.daily : s.bars ?? [];
    out.set(symbol, { bars: (s.bars ?? []).filter((b) => Date.parse(b.t) >= sinceMs), daily, monthly: s.monthlyYearCount ?? s.monthly });
  }
  const missing = Object.keys(manifest.files ?? {}).filter((n) => !seen.has(n));
  if (missing.length) throw new Error(`Bar cache is missing ${missing.length} file(s), e.g. ${missing[0]}`);
  return { series: out, hash: manifest.hash };
}

/** SPY buy-and-hold on exactly `dates` from a Yahoo v8 chart document (E6). */
export function spyBuyAndHold(doc, dates, { startEquity, costPerShare = 0.02, reinvest = true }) {
  const r = doc?.chart?.result?.[0];
  if (!r) throw new Error("SPY file is not a Yahoo v8 chart document");
  const q = r.indicators.quote[0];
  const byDay = new Map();
  const tz = r.meta?.exchangeTimezoneName ?? "America/New_York";
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  r.timestamp.forEach((ts, k) => byDay.set(fmt.format(new Date(ts * 1000)), { o: q.open[k], c: q.close[k] }));
  const divs = new Map();
  for (const d of Object.values(r.events?.dividends ?? {})) divs.set(fmt.format(new Date(d.date * 1000)), (divs.get(fmt.format(new Date(d.date * 1000))) ?? 0) + d.amount);
  const missing = dates.filter((d) => !byDay.has(d));
  if (missing.length) throw new Error(`SPY has no bar on ${missing.length} strategy session(s), e.g. ${missing[0]}; extend the file`);
  const first = byDay.get(dates[0]);
  let shares = Math.floor(startEquity / (first.o + costPerShare / 2));
  let cash = startEquity - shares * (first.o + costPerShare / 2);
  let dividends = 0;
  const curve = [];
  for (const d of dates) {
    const bar = byDay.get(d);
    const div = divs.get(d) ?? 0;
    if (div > 0) {
      cash += shares * div;
      dividends += shares * div;
      if (reinvest) {
        const add = Math.floor(cash / (bar.c + costPerShare / 2));
        shares += add;
        cash -= add * (bar.c + costPerShare / 2);
      }
    }
    curve.push({ date: d, equity: cash + shares * bar.c });
  }
  return { curve, dividends, shares, cash };
}

function quant(sorted, p) {
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : NaN;
}
const f = (x, d = 3) => (x === null || x === undefined || !Number.isFinite(x) ? "NOT MEASURED" : Number(x).toFixed(d));
const pct = (x, d = 1) => (Number.isFinite(x) ? `${(x * 100).toFixed(d)}%` : "NOT MEASURED");

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const server = await createServer({ configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true }, appType: "custom", logLevel: "warn" });
  const started = Date.now();
  try {
    const funded = await server.ssrLoadModule("/lib/backtest/fundedPortfolio.ts");
    const { simulatePortfolio } = await server.ssrLoadModule("/lib/backtest/portfolio.ts");
    const { runFixedHorizonControl } = await server.ssrLoadModule("/lib/backtest/fixedHorizonControl.ts");
    const { coreControlDraw } = await server.ssrLoadModule("/lib/backtest/coreControl.ts");
    const { equalWeightBenchmark } = await server.ssrLoadModule("/lib/backtest/controls.ts");
    const buf = await readFile(path.resolve(root, args.ledger));
    const ledgerSha = createHash("sha256").update(buf).digest("hex");
    const ledger = JSON.parse((args.ledger.endsWith(".gz") ? gunzipSync(buf) : buf).toString("utf8"));
    const longs = ledger.filter((t) => (t.side ?? (t.direction === "bearish" ? "short" : "long")) === "long");
    const { series, hash } = await readCache(path.resolve(root, args.barCache), args.since);
    const closes = new Map([...series].map(([s, x]) => [s, x.daily.map((b) => ({ t: b.t, c: b.c }))]));
    const daily = new Map([...series].map(([s, x]) => [s, x.daily]));
    const out = { args, ledgerSha, cacheHash: hash, versions: { funded: funded.FUNDED_PORTFOLIO_VERSION }, results: {} };
    const md = [`# Edge isolation results`, "", `Ledger sha256 \`${ledgerSha}\` (${longs.length} long campaigns). Bar cache manifest \`${hash}\`. Development data: nothing here is out-of-sample.`, ""];
    const E3 = { riskFraction: 0.0025, maxOpenRiskFraction: 0.25, maxConcurrent: 100, maxPositionFraction: 0.1 };
    const summary = (r) => ({ endEquity: r.endEquity, totalReturn: r.totalReturn, cagr: r.cagr, sharpe: r.sharpe, drawdown: r.drawdown, maxGross: r.maxGross, averageGross: r.averageGross, exposure: r.exposure, taken: r.taken, skipped: r.skipped, addsFilled: r.addsFilled, addsTrimmed: r.addsTrimmed, addsSkipped: r.addsSkipped, staleMarks: r.staleMarks, totalCosts: r.totalCosts, reconciliationError: r.reconciliationError, assumptions: r.assumptions });
    const row = (label, r) => `| ${label} | ${pct(r.cagr)} | ${f(r.sharpe, 2)} | ${pct(r.drawdown?.maxDrawdown ?? r.maxDrawdown)} | ${r.drawdown?.peakToTroughSessions ?? "n/a"} | ${r.drawdown?.longestUnderwaterSessions ?? r.maxDrawdownSessions} | ${r.taken ?? "n/a"} |`;
    let e3 = null;

    if (args.only.some((e) => ["e3", "e6", "e7b", "e8"].includes(e))) {
      e3 = funded.simulateFundedPortfolio(longs, { ...E3, closes });
      const orig = simulatePortfolio(longs, { ...E3, closes });
      out.results.e3 = { funded: summary(e3), original: { ...orig, curve: undefined, dailyReturns: undefined } };
      md.push("## E3: funded ledger at the original settings", "", "| Simulator | CAGR | Sharpe | Max drawdown | Peak→trough sessions | Longest underwater | Taken |", "|---|---:|---:|---:|---:|---:|---:|");
      md.push(row("Original `portfolio.ts` (first lots marked, adds at exit)", { ...orig, sharpe: funded.annualisedSharpe(orig.dailyReturns) }));
      md.push(row(`Funded ledger (${funded.FUNDED_PORTFOLIO_VERSION})`, e3), "");
      md.push(`Adds filled ${e3.addsFilled}, trimmed ${e3.addsTrimmed}, skipped ${e3.addsSkipped}. Gross exposure average ${f(e3.averageGross, 2)}× equity, peak ${f(e3.maxGross, 2)}×. Skips: ${JSON.stringify(e3.skipped)}. Stale marks ${e3.staleMarks}. Reconciliation error $${f(e3.reconciliationError, 6)}.`, "");
      const seeds = Array.from({ length: 20 }, (_, k) => k + 1).map((seed) => funded.simulateFundedPortfolio(longs, { ...E3, closes, order: { seed } }));
      const cs = seeds.map((r) => r.cagr).sort((a, b) => a - b);
      const dd = seeds.map((r) => r.drawdown.maxDrawdown).sort((a, b) => a - b);
      out.results.e3.orderSensitivity = { cagr: { min: cs[0], max: cs[cs.length - 1] }, maxDrawdown: { min: dd[0], max: dd[dd.length - 1] } };
      md.push(`Order sensitivity (20 seeded shuffles of same-session entries): CAGR ${pct(cs[0])} to ${pct(cs[cs.length - 1])}, max drawdown ${pct(dd[0])} to ${pct(dd[dd.length - 1])}.`, "");
    }
    for (const [id, opts, label] of [["e4", { ...E3, maxOpenRiskFraction: 0.05, maxConcurrent: 20 }, "0.25% risk, 5% open risk, 20 open"], ["e5", { ...E3, riskFraction: 0.00125, maxOpenRiskFraction: 0.025, maxConcurrent: 20 }, "0.125% risk, 2.5% open risk, 20 open"]]) {
      if (!args.only.includes(id)) continue;
      const r = funded.simulateFundedPortfolio(longs, { ...opts, closes });
      out.results[id] = summary(r);
      md.push(`## ${id.toUpperCase()}: risk arm (${label}), funded ledger`, "", "| Arm | CAGR | Sharpe | Max drawdown | Peak→trough sessions | Longest underwater | Taken |", "|---|---:|---:|---:|---:|---:|---:|", row(label, r), "");
    }
    if (args.only.includes("e2")) {
      const r = runFixedHorizonControl(longs, daily, { draws: args.draws });
      out.results.e2 = r;
      md.push(`## E2: fixed-horizon first-lot comparison (${r.version})`, "", "| Horizon | Used | Censored | Actual mean R | Control p5 / p50 / p95 | Draws ≥ actual | Paired diff (95% month-block CI) |", "|---:|---:|---:|---:|---|---:|---|");
      for (const h of r.horizons) md.push(`| ${h.horizon} | ${h.used} | ${h.censored} | ${f(h.actualMeanR)} | ${f(h.controlMeanR.p05)} / ${f(h.controlMeanR.p50)} / ${f(h.controlMeanR.p95)} | ${pct(h.shareAtOrAboveActual)} | ${f(h.pairedDiff.mean)} [${f(h.pairedDiff.lo)}, ${f(h.pairedDiff.hi)}] |`);
      md.push("");
    }
    if (args.only.includes("e6")) {
      if (!args.spy) {
        out.results.e6 = { status: "BLOCKED", reason: "no --spy file" };
        md.push("## E6: SPY buy-and-hold", "", "BLOCKED: no Yahoo SPY file covering the strategy's dates was supplied.", "");
      } else {
        const doc = JSON.parse(await readFile(path.resolve(root, args.spy), "utf8"));
        const dates = e3.curve.map((p) => p.date);
        const tr = spyBuyAndHold(doc, dates, { startEquity: e3.startEquity });
        const po = spyBuyAndHold(doc, dates, { startEquity: e3.startEquity, reinvest: false });
        const stats = (c) => {
          const rets = [];
          let prev = e3.startEquity;
          for (const p of c) {
            rets.push(p.equity / prev - 1);
            prev = p.equity;
          }
          const end = c[c.length - 1].equity;
          const yrs = (Date.parse(c[c.length - 1].date) - Date.parse(c[0].date)) / (365.25 * 86_400_000);
          return { endEquity: end, totalReturn: end / e3.startEquity - 1, cagr: Math.pow(end / e3.startEquity, 1 / yrs) - 1, sharpe: funded.annualisedSharpe(rets), drawdown: funded.drawdownStats(c, e3.startEquity) };
        };
        const bench = equalWeightBenchmark(daily).filter((d) => d.date >= dates[0] && d.date <= dates[dates.length - 1]);
        out.results.e6 = { totalReturnReinvested: { ...stats(tr.curve), dividends: tr.dividends }, cashDividends: stats(po.curve), dates: { first: dates[0], last: dates[dates.length - 1], sessions: dates.length } };
        md.push(`## E6: SPY buy-and-hold on the same ${dates.length} sessions (${dates[0]} to ${dates[dates.length - 1]})`, "", "| Series | CAGR | Sharpe | Max drawdown | Peak→trough sessions | Longest underwater | Taken |", "|---|---:|---:|---:|---:|---:|---:|");
        md.push(row("Strategy, funded ledger (E3)", e3), row("SPY, dividends reinvested", stats(tr.curve)), row("SPY, dividends held as cash", stats(po.curve)), "");
        md.push(`Bought at the first session's open with $${e3.startEquity.toLocaleString("en-US")}, whole shares, $0.02 a share. Dividends credited on the ex-date ($${tr.dividends.toFixed(2)} total). The cache's daily-rebalanced equal-weight basket is a different thing and is reported apart (${bench.length} sessions).`, "");
      }
    }
    if (args.only.includes("e7b")) {
      const bySym = new Map();
      for (const c of longs) {
        if (!series.has(c.symbol) || !Number.isFinite(c.rMultiple)) continue;
        if (!bySym.has(c.symbol)) bySym.set(c.symbol, []);
        bySym.get(c.symbol).push(c);
      }
      const runs = [];
      for (let d = 0; d < args.coreDraws; d++) {
        const draw = coreControlDraw(series, bySym, { seed: 20261105 + d, keepTrades: true });
        const r = funded.simulateFundedPortfolio(draw.trades, { ...E3, closes });
        runs.push({ seed: 20261105 + d, campaigns: draw.campaigns, meanR: draw.meanR, cagr: r.cagr, sharpe: r.sharpe, maxDrawdown: r.drawdown.maxDrawdown });
      }
      const c = runs.map((x) => x.cagr).filter(Number.isFinite).sort((a, b) => a - b);
      const s = runs.map((x) => x.sharpe).filter(Number.isFinite).sort((a, b) => a - b);
      out.results.e7b = { runs, actual: { cagr: e3.cagr, sharpe: e3.sharpe }, cagr: { p05: quant(c, 0.05), p50: quant(c, 0.5), p95: quant(c, 0.95), shareAtOrAboveActual: (c.filter((x) => x >= e3.cagr).length + 1) / (c.length + 1) }, sharpe: { p05: quant(s, 0.05), p50: quant(s, 0.5), p95: quant(s, 0.95), shareAtOrAboveActual: (s.filter((x) => x >= e3.sharpe).length + 1) / (s.length + 1) } };
      md.push(`## E7b: complete-policy random entries through the funded ledger (${args.coreDraws} draws)`, "", "| Measure | Actual | Control p5 / p50 / p95 | Draws ≥ actual |", "|---|---:|---|---:|");
      md.push(`| CAGR | ${pct(e3.cagr)} | ${pct(out.results.e7b.cagr.p05)} / ${pct(out.results.e7b.cagr.p50)} / ${pct(out.results.e7b.cagr.p95)} | ${pct(out.results.e7b.cagr.shareAtOrAboveActual)} |`);
      md.push(`| Sharpe | ${f(e3.sharpe, 2)} | ${f(out.results.e7b.sharpe.p05, 2)} / ${f(out.results.e7b.sharpe.p50, 2)} / ${f(out.results.e7b.sharpe.p95, 2)} | ${pct(out.results.e7b.sharpe.shareAtOrAboveActual)} |`, "");
    }
    if (args.only.includes("e8")) {
      const traces = new Map(e3.campaigns.map((c) => [`${c.symbol}|${c.openedAt}`, c]));
      const ranked = [...longs].filter((t) => Number.isFinite(t.rMultiple)).sort((a, b) => b.rMultiple - a.rMultiple);
      const top = ranked.slice(0, Math.round(ranked.length * 0.01));
      const rows = top.map((t) => {
        const bars = daily.get(t.symbol) ?? [];
        const span = bars.filter((b) => b.t.slice(0, 10) >= t.openedAt.slice(0, 10) && b.t.slice(0, 10) <= (t.closedAt ?? "9999").slice(0, 10));
        const risk = Math.abs(t.entry - t.stop);
        const tr = traces.get(`${t.symbol}|${t.openedAt}`);
        return {
          symbol: t.symbol, openedAt: t.openedAt.slice(0, 10), closedAt: t.closedAt?.slice(0, 10) ?? null, entryKind: t.coreEntryKind, stopShare: risk / t.entry, barsHeld: t.barsHeld,
          rMultiple: t.rMultiple, rFirstLot: t.rFirstLot, rAdds: t.rMultiple - t.rFirstLot, lots: t.lots, exitReason: t.exitReason,
          mfeR: span.length ? (Math.max(...span.map((b) => b.h)) - t.entry) / risk : NaN, maeR: span.length ? (Math.min(...span.map((b) => b.l)) - t.entry) / risk : NaN,
          fundedAccepted: tr?.accepted ?? false, fundedReason: tr?.reason ?? null, fundedPnl: tr?.pnl ?? 0,
        };
      });
      const sum = ranked.reduce((s, t) => s + t.rMultiple, 0);
      const topSum = top.reduce((s, t) => s + t.rMultiple, 0);
      const groups = (key) => {
        const g = new Map();
        for (const r of rows) g.set(key(r), (g.get(key(r)) ?? 0) + 1);
        return [...g].sort((a, b) => b[1] - a[1]);
      };
      const loo = (key) => groups(key).map(([k]) => {
        const rest = ranked.filter((t) => key({ symbol: t.symbol, openedAt: t.openedAt.slice(0, 10) }) !== k);
        return { group: k, meanRWithout: rest.reduce((s, t) => s + t.rMultiple, 0) / rest.length };
      });
      out.results.e8 = { n: top.length, topSumR: topSum, allSumR: sum, rows, accepted: rows.filter((r) => r.fundedAccepted).length, bySymbol: groups((r) => r.symbol), byMonth: groups((r) => r.openedAt.slice(0, 7)), leaveOneSymbolOut: loo((r) => r.symbol), leaveOneMonthOut: loo((r) => r.openedAt.slice(0, 7)) };
      md.push(`## E8: the top ${top.length} campaigns`, "", `Sum ${f(topSum, 1)}R of the ledger's ${f(sum, 1)}R. Accepted by the funded ledger: ${out.results.e8.accepted} of ${top.length}. Add contribution (rMultiple − rFirstLot, an accounting split): ${f(rows.reduce((s, r) => s + r.rAdds, 0), 1)}R. Full rows in the JSON.`, "");
      md.push(`By symbol: ${out.results.e8.bySymbol.slice(0, 10).map(([k, n]) => `${k} ${n}`).join(", ")}. By opening month: ${out.results.e8.byMonth.slice(0, 10).map(([k, n]) => `${k} ${n}`).join(", ")}.`, "");
    }
    md.push(`Ran in ${((Date.now() - started) / 60_000).toFixed(1)} minutes.`, "");
    const dir = path.resolve(root, args.out);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "edge-isolation.json"), JSON.stringify(out, null, 2) + "\n");
    if (e3) await writeFile(path.join(dir, "e3-funded-curve.json"), JSON.stringify(e3.curve) + "\n");
    if (e3) await writeFile(path.join(dir, "e3-funded-campaigns.json"), JSON.stringify(e3.campaigns) + "\n");
    await writeFile(path.join(dir, "edge-isolation.md"), md.join("\n"));
    process.stdout.write(md.join("\n"));
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

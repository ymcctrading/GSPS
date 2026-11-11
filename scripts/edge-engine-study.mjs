#!/usr/bin/env node
/**
 * Walk-forward study of the price-time square engine (lib/research/edgeEngine).
 * RESEARCH ONLY: reads a folder of daily CSVs (date,o,h,l,c,v), never the
 * database, and writes JSON results. Nothing here reaches a member.
 *
 *   node scripts/edge-engine-study.mjs fit  --data DIR --out DIR [--symbols FILE]
 *   node scripts/edge-engine-study.mjs test --data DIR --out DIR --variant FILE [--symbols FILE] [--from D --to D]
 *
 * fit: on the first half (2018-07-01 .. 2022-06-30) tries every variant in the
 * grid (thresholds by coverage quantile x trigger x weight set), counts them,
 * and picks the one with the best mean weekly net return (>= 100 trades).
 * test: runs the one frozen variant on the second half (or the given dates)
 * with every control, and writes the verdict against the frozen bar.
 */
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIT = { from: "2018-07-01", to: "2022-06-30" };
const TEST = { from: "2022-07-01", to: "2026-10-30" };

async function engine() {
  const { createJiti } = await import(path.join(ROOT, "node_modules/jiti/lib/jiti.mjs"));
  const jiti = createJiti(import.meta.url, { alias: { "@": ROOT } });
  return jiti.import(path.join(ROOT, "lib/research/edgeEngine/index.ts"));
}

function loadCsv(file) {
  return fs.readFileSync(file, "utf8").trim().split("\n").slice(1).map((l) => {
    const [t, o, h, lo, c, v] = l.split(",");
    return { t, o: +o, h: +h, l: +lo, c: +c, v: +v };
  });
}

function natalDates() {
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, "lib/gann/firstTradeDates.json"), "utf8"));
  const out = {};
  for (const [s, e] of Object.entries(j.dates)) out[s] = e.date ?? e.wikidata ?? e.sec ?? e.yahoo ?? null;
  return out;
}

/* ------------------------------------------------------------------ worker */
async function workerMain() {
  const E = await engine();
  const { symbols, data } = workerData;
  const natal = natalDates();
  const preps = new Map();
  for (const s of symbols) {
    const bars = loadCsv(path.join(data, `${s}.csv`));
    if (bars.length < 300) continue;
    const P = E.prepare(s, bars, E.DEFAULT_CONFIG, natal[s] ?? null);
    P.candidates = P.candidates.filter((c) => c.family === "T7.cycle");
    P.levelSets = [];
    preps.set(s, P);
  }
  const compact = (t) => ({
    symbol: t.symbol, index: t.index, exitIndex: t.exitIndex, date: preps.get(t.symbol).dates[t.index], exitDate: preps.get(t.symbol).dates[t.exitIndex],
    price: t.price, stop: t.stop, exitPrice: t.exitPrice, exitReason: t.exitReason, ret: t.ret, r: t.r, bars: t.bars, trigger: t.trigger,
    cancelUntil: t.cancelUntil, event: t.event ? { grade: t.event.grade, timeScore: t.event.timeScore, priceScore: t.event.priceScore, timeFamilies: t.event.timeFamilies, priceFamilies: t.event.priceFamilies, index: t.event.index } : null,
  });
  parentPort.on("message", (m) => {
    try {
      if (m.kind === "series") {
        const out = [];
        for (const P of preps.values()) out.push({ symbol: P.symbol, dates: P.dates, closes: P.bars.map((b) => b.c) });
        parentPort.postMessage({ id: m.id, result: out });
      } else if (m.kind === "hist") {
        // score histograms on a window, for a weight set
        const cfg = { ...E.DEFAULT_CONFIG, ...m.cfg };
        const th = {}, ph = {};
        let n = 0;
        for (const P of preps.values()) for (let t = 1; t < P.bars.length; t++) {
          if (P.dates[t] < m.from || P.dates[t] > m.to) continue;
          n++;
          const a = Math.round(E.timeScoreAt(P, t, cfg) * 100) / 100;
          const b = Math.round(E.priceScoreAt(P, t, "bottom", cfg) * 100) / 100;
          th[a] = (th[a] ?? 0) + 1;
          ph[b] = (ph[b] ?? 0) + 1;
        }
        parentPort.postMessage({ id: m.id, result: { th, ph, n } });
      } else if (m.kind === "hits") {
        parentPort.postMessage({ id: m.id, result: E.sourceHitCounts([...preps.values()], m.from, m.to) });
      } else if (m.kind === "trades") {
        const out = {};
        for (const v of m.variants) {
          const cfg = { ...E.DEFAULT_CONFIG, ...v.cfg, slippageBp: v.cfg.slippageBp ?? E.DEFAULT_CONFIG.slippageBp };
          const ts = [];
          for (const P of preps.values()) for (const t of E.longTrades(P, cfg)) ts.push(compact(t));
          out[v.name] = ts;
        }
        parentPort.postMessage({ id: m.id, result: out });
      } else if (m.kind === "creation") {
        const cfg = { ...E.DEFAULT_CONFIG, ...m.cfg };
        const out = [];
        for (const P of preps.values()) for (const r of E.creationTrades(P, cfg)) {
          const d = P.dates[r.trade.index];
          if (d >= m.from && d <= m.to) out.push({ symbol: P.symbol, cell: r.cell, ret: r.trade.ret });
        }
        parentPort.postMessage({ id: m.id, result: out });
      } else if (m.kind === "random") {
        const cfg = { ...E.DEFAULT_CONFIG, ...m.cfg };
        const rand = E.rng(m.seed);
        const sums = new Float64Array(m.draws);
        const counts = new Float64Array(m.draws);
        const mine = m.taken.filter((t) => preps.has(t.symbol));
        for (let d = 0; d < m.draws; d++) for (const t of mine) {
          const tw = E.randomTwin(preps.get(t.symbol), t, cfg, rand);
          if (tw) { sums[d] += tw.ret; counts[d]++; }
        }
        parentPort.postMessage({ id: m.id, result: { sums: [...sums], counts: [...counts] } });
      }
    } catch (e) {
      parentPort.postMessage({ id: m.id, error: String(e && e.stack || e) });
    }
  });
  parentPort.postMessage({ ready: true, n: preps.size });
}

/* ------------------------------------------------------------------ parent */
function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

class Pool {
  constructor(symbols, data, n) {
    const chunks = Array.from({ length: n }, () => []);
    symbols.forEach((s, i) => chunks[i % n].push(s));
    this.workers = chunks.map((c) => new Worker(fileURLToPath(import.meta.url), { workerData: { symbols: c, data }, resourceLimits: { maxOldGenerationSizeMb: 3000 } }));
    this.seq = 0;
    this.pending = new Map();
    this.ready = Promise.all(this.workers.map((w) => new Promise((res, rej) => {
      w.on("error", rej);
      w.on("message", (m) => {
        if (m.ready) return res(m.n);
        const p = this.pending.get(m.id);
        if (!p) return;
        this.pending.delete(m.id);
        if (m.error) p.rej(new Error(m.error));
        else p.res(m.result);
      });
    })));
  }
  all(msg) {
    return Promise.all(this.workers.map((w) => new Promise((res, rej) => {
      const id = ++this.seq;
      this.pending.set(id, { res, rej });
      w.postMessage({ ...msg, id });
    })));
  }
  close() { for (const w of this.workers) w.terminate(); }
}

function quantileThreshold(hist, n, topShare) {
  // the smallest score s with share(score >= s) <= topShare
  const ks = Object.keys(hist).map(Number).sort((a, b) => b - a);
  let c = 0;
  let best = ks[0];
  for (const k of ks) {
    if ((c + hist[k]) / n > topShare) break;
    c += hist[k];
    best = k;
  }
  return best;
}

const mergeHist = (hs, key) => {
  const out = {};
  for (const h of hs) for (const [k, v] of Object.entries(h[key])) out[k] = (out[k] ?? 0) + v;
  return out;
};

async function main() {
  const phase = process.argv[2];
  const data = arg("data");
  const outDir = arg("out");
  fs.mkdirSync(outDir, { recursive: true });
  const symbols = arg("symbols")
    ? fs.readFileSync(arg("symbols"), "utf8").split(/\s+/).filter(Boolean)
    : fs.readdirSync(data).filter((f) => f.endsWith(".csv")).map((f) => f.slice(0, -4)).sort();
  const E = await engine();
  const t0 = Date.now();
  const pool = new Pool(symbols, data, Math.min(4, os.cpus().length));
  const sizes = await pool.ready;
  console.log(`prepared ${sizes.reduce((a, b) => a + b, 0)} symbols in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  const series = (await pool.all({ kind: "series" })).flat();
  const prep = new Map(series.map((s) => [s.symbol, { symbol: s.symbol, dates: s.dates, bars: s.closes.map((c) => ({ c })) }]));
  const log = (o) => fs.appendFileSync(path.join(outDir, "log.jsonl"), JSON.stringify(o) + "\n");

  const evalVariant = async (name, cfg, win, trades) => {
    const ts = trades ?? (await pool.all({ kind: "trades", variants: [{ name, cfg }] })).flatMap((r) => r[name]);
    const fullCfg = { ...E.DEFAULT_CONFIG, ...cfg };
    const b = E.book(ts.map((t) => ({ ...t, index: t.index })), prep, fullCfg, win.from, win.to);
    const sum = E.summarizeWeeks(b.weeks);
    return { ts, b, sum, stats: E.tradeStats(b.taken) };
  };

  if (phase === "fit") {
    const hits = E.hitRates(E.mergeHitCounts(await pool.all({ kind: "hits", ...FIT })));
    fs.writeFileSync(path.join(outDir, "fit-hit-rates.json"), JSON.stringify(hits, null, 1));
    const fitted = {
      timeWeights: Object.fromEntries(E.TIME_FAMILIES.map((f) => [f, Math.max(0, (hits.find((h) => h.family === f).lift - 1) * 10)])),
      priceWeights: Object.fromEntries(E.PRICE_FAMILIES.map((f) => [f, Math.max(0, (hits.find((h) => h.family === f).lift - 1) * 10)])),
    };
    const weightSets = { default: { timeWeights: E.DEFAULT_TIME_WEIGHTS, priceWeights: E.DEFAULT_PRICE_WEIGHTS }, fitted };
    const variants = [];
    const thresholds = {};
    for (const [wname, w] of Object.entries(weightSets)) {
      const hs = await pool.all({ kind: "hist", cfg: w, ...FIT });
      const n = hs.reduce((a, h) => a + h.n, 0);
      const th = mergeHist(hs, "th");
      const ph = mergeHist(hs, "ph");
      thresholds[wname] = {
        kt: Object.fromEntries([0.5, 0.25, 0.1, 0.05].map((q) => [q, quantileThreshold(th, n, q)])),
        kp: Object.fromEntries([0.5, 0.25, 0.1].map((q) => [q, quantileThreshold(ph, n, q)])),
      };
      for (const [qt, kt] of Object.entries(thresholds[wname].kt)) for (const [qp, kp] of Object.entries(thresholds[wname].kp)) for (const trigger of ["E1", "E2", "E3", "E6"]) {
        variants.push({ name: `${wname}|t${qt}|p${qp}|${trigger}`, cfg: { ...w, kt, kp, trigger } });
      }
    }
    fs.writeFileSync(path.join(outDir, "fit-thresholds.json"), JSON.stringify({ thresholds, weightSets }, null, 1));
    console.log(`${variants.length} variants`);
    const results = [];
    for (let i = 0; i < variants.length; i += 8) {
      const chunk = variants.slice(i, i + 8);
      const byW = await pool.all({ kind: "trades", variants: chunk });
      for (const v of chunk) {
        const ts = byW.flatMap((r) => r[v.name]);
        const r = await evalVariant(v.name, v.cfg, FIT, ts);
        const row = { name: v.name, cfg: { kt: v.cfg.kt, kp: v.cfg.kp, trigger: v.cfg.trigger }, taken: r.b.taken.length, signals: ts.filter((t) => t.date >= FIT.from && t.date <= FIT.to).length, meanWeek: r.sum.mean, t: r.sum.t, positive: r.sum.positive, meanTrade: r.stats.meanRet, winRate: r.stats.winRate, pf: r.stats.profitFactor };
        results.push(row);
        log({ phase: "fit", ...row });
        console.log(row.name, row.taken, (row.meanWeek * 100).toFixed(3) + "%/wk", "t", row.t.toFixed(2));
      }
    }
    const eligible = results.filter((r) => r.taken >= 100).sort((a, b) => b.meanWeek - a.meanWeek);
    const chosen = eligible[0];
    const v = variants.find((x) => x.name === chosen.name);
    fs.writeFileSync(path.join(outDir, "fit-results.json"), JSON.stringify({ window: FIT, variantsTried: variants.length, results, chosen: chosen.name }, null, 1));
    fs.writeFileSync(path.join(outDir, "chosen-variant.json"), JSON.stringify(v, null, 1));
    console.log("chosen", chosen.name, `${(Date.now() - t0) / 1000} s`);
    pool.close();
    return;
  }

  if (phase === "test") {
    const win = { from: arg("from", TEST.from), to: arg("to", TEST.to) };
    const v = JSON.parse(fs.readFileSync(arg("variant"), "utf8"));
    const draws = +arg("draws", "200");
    const seed = +arg("seed", "20261110");
    const main = await evalVariant(v.name, v.cfg, win);
    const dbl = await evalVariant(v.name + "|2x slippage", { ...v.cfg, slippageBp: 2 * E.DEFAULT_CONFIG.slippageBp }, win);
    const taken = main.b.taken;
    const rr = await pool.all({ kind: "random", cfg: v.cfg, taken, draws, seed });
    const means = Array.from({ length: draws }, (_, d) => {
      const s = rr.reduce((a, r) => a + r.sums[d], 0);
      const c = rr.reduce((a, r) => a + r.counts[d], 0);
      return c ? s / c : 0;
    });
    const actual = main.stats.meanRet;
    const pRandom = (means.filter((m) => m >= actual).length + 1) / (draws + 1);
    const bh = E.buyAndHold(prep, win.from, win.to);
    const bhMean = [...bh.values()].reduce((a, b) => a + b, 0) / Math.max(1, bh.size);
    const diffs = main.b.weeks.filter((w) => bh.has(w.week)).map((w) => w.ret - bh.get(w.week));
    const dm = diffs.reduce((a, b) => a + b, 0) / Math.max(1, diffs.length);
    const dsd = Math.sqrt(diffs.reduce((a, b) => a + (b - dm) ** 2, 0) / Math.max(1, diffs.length - 1));
    const expo = main.b.weeks.filter((w) => bh.has(w.week)).map((w) => w.ret - w.exposure * bh.get(w.week));
    const em = expo.reduce((a, b) => a + b, 0) / Math.max(1, expo.length);
    const crea = (await pool.all({ kind: "creation", cfg: v.cfg, ...win })).flat();
    const cellRows = crea.map((r) => ({ cell: r.cell, trade: { ret: r.ret } }));
    const cellStats = E.cells(cellRows);
    const bySym = new Map();
    for (const r of crea) (bySym.get(r.symbol) ?? bySym.set(r.symbol, []).get(r.symbol)).push({ cell: r.cell, trade: { ret: r.ret } });
    const boot = E.interactionBootstrap(bySym, 500, seed);
    const hits = E.hitRates(E.mergeHitCounts(await pool.all({ kind: "hits", ...win })));
    const years = main.sum.years;
    const yearsPositive = Object.values(years).filter((x) => x > 0).length;
    const I = E.interaction(cellStats);
    const pass = {
      meanWeekPositiveT2: main.sum.mean > 0 && main.sum.t > 2,
      positiveWeeks55: main.sum.positive >= 0.55,
      randomP01: pRandom < 0.01,
      beatsBuyAndHold: main.sum.mean > bhMean,
      doubleSlippagePositive: dbl.sum.mean > 0,
      yearsPositive: yearsPositive >= Math.ceil(0.8 * Object.keys(years).length),
      creation: I > 0 && boot.lo > 0 && cellStats.both.mean > cellStats.time.mean && cellStats.both.mean > cellStats.price.mean,
    };
    const result = {
      window: win, variant: v, draws, seed,
      book: main.sum, trades: main.stats, signals: main.ts.filter((t) => t.date >= win.from && t.date <= win.to).length, skipped: main.b.skipped,
      doubleSlippage: dbl.sum,
      random: { actualMeanTrade: actual, meanOfDraws: means.reduce((a, b) => a + b, 0) / draws, p: pRandom },
      buyAndHold: { meanWeek: bhMean, bookMinusBH: dm, t: dsd > 0 ? (dm / dsd) * Math.sqrt(diffs.length) : 0, exposureMatchedExcess: em },
      creation: { cells: cellStats, interaction: I, bootstrap95: [boot.lo, boot.hi], pPositive: boot.pPositive },
      hitRates: hits, years, pass, PASS: Object.values(pass).every(Boolean),
      sample: taken.slice(0, 25),
    };
    fs.writeFileSync(path.join(outDir, `test-${win.from}-${win.to}.json`), JSON.stringify(result, null, 1));
    console.log(JSON.stringify({ book: main.sum, trades: main.stats, random: result.random, buyAndHold: result.buyAndHold, creation: result.creation, pass, PASS: result.PASS }, null, 1));
    pool.close();
    return;
  }
  pool.close();
  throw new Error("phase must be fit or test");
}

if (isMainThread) main().catch((e) => { console.error(e); process.exit(1); });
else workerMain();

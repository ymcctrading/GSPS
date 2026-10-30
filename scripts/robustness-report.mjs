/**
 * Robustness report for a finished universe backtest, run locally on its
 * trade list (Q2 "Prove the edge", 2026-10-28). No Actions minutes and no
 * vendor keys: the input is the `trades.csv` a `backtest-universe.yml` job
 * prints to its log (`tradesCsv` in `backtest-universe.mjs`; decode the
 * `.gz.base64` block first when the log carries that form).
 *
 * Usage:
 *   node scripts/robustness-report.mjs --trades trades.csv [--cell prod]
 *     [--scope all|execute] [--market daily.csv]
 *
 * `--cell` names the cell to read; it is required when the file holds more
 * than one, since every cell replays the same symbols and dates and pooling
 * them would count each trade once per cell. `--scope execute` reads the
 * trades the scan called Execute; every one of them scores 7 or more, so
 * there the walk-forward can only choose between 7, 8 and 9 within Execute,
 * not the cutoff itself.
 *
 * `--market` is a daily-bar CSV with `symbol,date,o,h,l,c,v` columns and a
 * plain `YYYY-MM-DD` date; its SPY rows give the regime split (the market's
 * Gann trend and corrections). Without it the regime section is left out.
 * `/mnt/project-files/wide-range-study/data/daily-basket.csv.gz` (gunzip it
 * first) is one, through 2026-10-28.
 *
 * The figures come from `buildRobustness` in `lib/backtest/robustness.ts`,
 * loaded through Vite so the report reads the shipped code. Trades still open
 * when the data ended are left out and counted; reversals and re-entries are
 * reported apart. The Monte Carlo of the same trades is reported separately.
 */

import { createServer } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function parseArgs(argv) {
  const args = { trades: null, cell: null, scope: "all", market: null };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[++i];
    if (value === undefined) throw new Error(`Missing value for ${flag}`);
    switch (flag) {
      case "--trades": args.trades = value; break;
      case "--cell": args.cell = value; break;
      case "--scope": args.scope = value; break;
      case "--market": args.market = value; break;
      default: throw new Error(`Unknown flag ${flag}`);
    }
  }
  if (!args.trades) throw new Error("--trades <trades.csv> is required");
  if (!["all", "execute"].includes(args.scope)) throw new Error("--scope must be all or execute");
  return args;
}

/** Splits one CSV line, honouring double-quoted fields. */
export function splitCsvLine(line) {
  const out = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { out.push(field); field = ""; }
    else field += ch;
  }
  out.push(field);
  return out;
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const header = splitCsvLine(lines[0]);
  return lines.slice(1).map((l) => {
    const cells = splitCsvLine(l);
    return Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ""]));
  });
}

/**
 * Rows of `tradesCsv` as the trades `robustness.ts` reads. `bucket` is the
 * scan's `outputState` ("Execute", "Watch", "Reject"), "unscored", or empty
 * for a derived trade. Refuses to pool several cells.
 *
 * @param {string} text
 * @param {{ cell?: string | null, scope?: string }} [opts]
 */
export function tradesFromCsv(text, { cell = null, scope = "all" } = {}) {
  const rows = parseCsv(text);
  const cells = [...new Set(rows.map((r) => r.cell))];
  if (cell === null && cells.length > 1) throw new Error(`The file holds cells ${cells.join(", ")}: name one with --cell`);
  if (cell !== null && !cells.includes(cell)) throw new Error(`No cell "${cell}" (the file holds ${cells.join(", ")})`);
  return rows
    .filter((r) => cell === null || r.cell === cell)
    .filter((r) => scope !== "execute" || r.bucket === "Execute")
    .filter((r) => r.R !== "")
    .map((r) => ({
      openedAt: r.entryTime,
      closedAt: r.exitTime || undefined,
      rMultiple: Number(r.R),
      direction: r.side === "short" ? "bearish" : "bullish",
      exitReason: r.exitReason || undefined,
      score: r.score === "" ? undefined : Number(r.score),
      outputState: r.bucket || undefined,
      derived: r.derived || undefined,
    }));
}

/**
 * The SPY rows of a daily-bar CSV as bars, oldest first. Refuses a date that
 * is not `YYYY-MM-DD`, a date given twice, and a price that is blank or not a
 * positive number (a blank close would read as 0, a correction).
 *
 * @param {string} text
 * @returns {{ t: string, o: number, h: number, l: number, c: number, v: number }[]}
 */
export function marketFromCsv(text) {
  const bars = parseCsv(text)
    .filter((b) => b.symbol === "SPY")
    .map((b) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date)) throw new Error(`--market date "${b.date}" is not YYYY-MM-DD`);
      const price = (k) => {
        const x = b[k] === "" ? NaN : Number(b[k]);
        if (!Number.isFinite(x) || x <= 0) throw new Error(`--market ${b.date}: ${k} "${b[k]}" is not a positive price`);
        return x;
      };
      // 20:00 UTC is after the close in New York in summer and winter alike.
      return { t: `${b.date}T20:00:00Z`, o: price("o"), h: price("h"), l: price("l"), c: price("c"), v: +b.v };
    })
    .sort((a, b) => (a.t < b.t ? -1 : 1));
  if (bars.length === 0) throw new Error("--market has no SPY rows");
  for (let i = 1; i < bars.length; i++) {
    if (bars[i].t === bars[i - 1].t) throw new Error(`--market has SPY on ${bars[i].t.slice(0, 10)} twice`);
  }
  return bars;
}

const fmtR = (x) => (x === null || x === undefined || !Number.isFinite(x) ? "—" : `${x >= 0 ? "+" : ""}${x.toFixed(3)}R`);
const fmtCI = (ci) => (ci ? `[${fmtR(ci[0])}, ${fmtR(ci[1])}]` : "—");
const fmtPct = (x) => (x === null || x === undefined ? "—" : `${(x * 100).toFixed(1)}%`);
const row = (label, s) => `| ${label} | ${s.n} | ${fmtR(s.expectancyR)} | ${fmtCI(s.expectancyCI95)} | ${fmtPct(s.winRate)} | ${s.totalR.toFixed(1)} |`;
const HEAD = "| | Trades | Expectancy | 95% CI | Win rate | Total R |\n|---|---|---|---|---|---|";

/**
 * The report's sections, under headings of `level` (`##` alone, `###` inside
 * the universe summary). Shared with `backtest-universe.mjs`.
 */
export function robustnessSections(rep, level = "##") {
  const wf = rep.walkForward;
  const out = [];
  const cell = (s) => `${fmtR(s.expectancyR)} (${s.n})`;
  out.push(
    `${rep.n} closed trades the replay armed; ${rep.openAtEnd} still open when the data ended (left out); ${rep.derived.n} reversals and re-entries apart (${fmtR(rep.derived.expectancyR)}).` +
      (rep.heldToLimit > 0 ? ` ${rep.heldToLimit} of the ${rep.n} ended at the session limit and are valued at that bar's close, not a realised exit.` : ""),
    "",
    `${level} Walk-forward (calendar quarters)`,
    "",
    `Over all of each quarter's trades: ${wf.positiveWindows.positive} of ${wf.positiveWindows.of} quarters positive; longest run of quarters at or below zero: ${wf.longestLosingRun}.`,
    `Out of sample, the cutoff chosen on trades closed before each quarter: ${fmtR(wf.outOfSample.expectancyR)} ${fmtCI(wf.outOfSample.expectancyCI95)} over ${wf.outOfSample.n} trades; score ≥ ${wf.fixedCutoff} on the same quarters: ${fmtR(wf.fixedOnSameWindows.expectancyR)} ${fmtCI(wf.fixedOnSameWindows.expectancyCI95)} over ${wf.fixedOnSameWindows.n}.`,
    "",
    `| Quarter | Trades | Expectancy | 95% CI | Score ≥ ${wf.fixedCutoff} | Execute | Chosen cutoff | Chosen, out of sample |`,
    "|---|---|---|---|---|---|---|---|",
  );
  for (const w of wf.windows) {
    out.push(
      `| ${w.window} | ${w.n} | ${fmtR(w.expectancyR)} | ${fmtCI(w.expectancyCI95)} | ${cell(w.fixedCutoff)} | ${cell(w.execute)} | ${w.chosenCutoff ?? "—"} | ${w.chosen ? cell(w.chosen) : "—"} |`,
    );
  }
  out.push(
    "",
    `${level} Stress windows`,
    "",
    "A trade counts in the window it opened in, wherever it closed.",
    "",
    "| Window | Trades | Expectancy | 95% CI | Win rate | Total R | Longs | Shorts |",
    "|---|---|---|---|---|---|---|---|",
  );
  for (const s of rep.stress) out.push(`${row(`${s.label} (${s.from} to ${s.to})`, s)} ${cell(s.longs)} | ${cell(s.shorts)} |`);
  if (rep.regimes) {
    const g = rep.regimes;
    out.push("", `${level} Market regime (SPY, read on the sessions before each trade opened)`, "", HEAD);
    for (const [k, s] of Object.entries(g.byTrend)) out.push(row(`Market trend ${k}`, s));
    out.push(row("Trade with the market's trend", g.withMarket.with), row("Trade against it", g.withMarket.against), row("No market trend", g.withMarket.none));
    for (const [k, s] of Object.entries(g.byCorrection)) out.push(row(`Market ${k === "correction" ? "in a correction (10% under the year's high)" : k}`, s));
    if (g.bySide) {
      const side = (k) => (k.startsWith("long") ? "Longs" : "Shorts");
      const trendWord = { up: "market up", down: "market down", none: "no market trend" };
      out.push("", `${level} Longs and shorts by regime`, "", HEAD);
      out.push(row("Longs", g.bySide.long), row("Shorts", g.bySide.short));
      for (const [k, s] of Object.entries(g.sideByTrend)) out.push(row(`${side(k)}, ${trendWord[k.split(":")[1]]} (trend reading)`, s));
      if (g.sideBySwingTrend) {
        for (const [k, s] of Object.entries(g.sideBySwingTrend)) out.push(row(`${side(k)}, ${trendWord[k.split(":")[1]]} (3-Day and weekly charts)`, s));
      }
      for (const [k, s] of Object.entries(g.sideByCorrection)) {
        const c = k.split(":")[1];
        if (c !== "unknown" || s.n > 0) out.push(row(`${side(k)}, ${c === "correction" ? "in a correction" : c === "normal" ? "no correction" : "no reading"}`, s));
      }
    }
  }
  return out;
}

export function reportMarkdown(args, rep) {
  return [`# Robustness — ${args.cell ?? "the file's cell"}, scope ${args.scope}`, "", ...robustnessSections(rep)].join("\n") + "\n";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const server = await createServer({
    configFile: false,
    root,
    resolve: { alias: { "@": root } },
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "warn",
  });
  try {
    const { buildRobustness } = await server.ssrLoadModule("/lib/backtest/robustness.ts");
    const trades = tradesFromCsv(await readFile(args.trades, "utf8"), args);
    const market = args.market ? marketFromCsv(await readFile(args.market, "utf8")) : undefined;
    process.stdout.write(reportMarkdown(args, buildRobustness(trades, market)));
  } finally {
    await server.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

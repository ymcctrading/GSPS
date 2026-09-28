/**
 * Runs the pre-registered calendar test (lib/research/calendarTest.ts;
 * docs/memory-bank/F4_CYCLES_CALENDAR_RESEARCH.md Part 3) on daily bars from
 * the platform's market-data provider, and prints the results as JSON between
 * BEGIN/END markers. Research only.
 *
 *   node scripts/calendar-test.mjs --symbols SPY,DIA --start 1990-01-01
 *
 * In CI it runs through the universe-backtest workflow with
 * `universe: calendar-test` (a workflow must be on the default branch to be
 * dispatched, so this rides the existing one): the harness hands off here.
 */

import { createServer } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

export async function runCalendarTest({ symbols = ["SPY", "DIA"], start: startIso = "1990-01-01" } = {}) {
  const start = new Date(`${startIso}T00:00:00Z`);
  const server = await createServer({
    configFile: false,
    root,
    resolve: { alias: { "@": root } },
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "warn",
  });
  try {
    const { getMarketDataProvider } = await server.ssrLoadModule("/lib/data/provider.ts");
    const { walkSwingChart, WEEKLY_SWING_CHART } = await server.ssrLoadModule("/lib/gann/swingChart.ts");
    const ct = await server.ssrLoadModule("/lib/research/calendarTest.ts");
    const provider = getMarketDataProvider();
    const results = [];
    const blocks = [];
    for (const symbol of symbols) {
      const bars = await provider.fetchBars(symbol, "1Day", start, null, "us_equity");
      if (bars.length < 500) {
        results.push({ series: symbol, error: `only ${bars.length} bars` });
        continue;
      }
      const sessions = bars.map((b) => Date.UTC(...b.t.slice(0, 10).split("-").map((x, i) => (i === 1 ? Number(x) - 1 : Number(x)))));
      const walk = walkSwingChart(bars, WEEKLY_SWING_CHART);
      // Completed pivots only: the last pivot's swing may still be running.
      const pivots = walk.pivots.slice(0, -1).map((p) => p.index);
      for (const set of ["W1", "W3"]) {
        for (const convention of ct.CONVENTIONS) {
          results.push(ct.scoreCell(symbol, { sessions, pivots }, set, convention));
        }
      }
      // Phase check for W1: the scored whole years split into four blocks.
      // Each block is scored on the full record, restricted to its own years,
      // so a window near a block edge still sees its ±2-session tolerance.
      const firstWhole = new Date(sessions[0]).getUTCFullYear() + 1;
      const lastWhole = new Date(sessions[sessions.length - 1]).getUTCFullYear() - 1;
      const years = [];
      for (let y = firstWhole; y <= lastWhole; y++) years.push(y);
      const q = Math.ceil(years.length / 4);
      for (let k = 0; k < 4; k++) {
        const ys = years.slice(k * q, (k + 1) * q);
        if (ys.length === 0) continue;
        for (const convention of ["calendar", "solar"]) {
          const r = ct.scoreCell(symbol, { sessions, pivots }, "W1", convention, [ys[0], ys[ys.length - 1]]);
          blocks.push({ series: symbol, block: `${ys[0]}-${ys[ys.length - 1]}`, convention, hitRate: r.hitRate, baseMean: r.baseMean, p: r.p, instances: r.instances });
        }
      }
      results.push({ series: symbol, bars: bars.length, from: bars[0].t.slice(0, 10), to: bars[bars.length - 1].t.slice(0, 10), pivots: pivots.length });
    }
    ct.holm(results.filter((r) => typeof r.p === "number"));
    const out = { generatedAt: new Date().toISOString(), start: start.toISOString().slice(0, 10), results, blocks };
    console.log("=== BEGIN calendar-test.json ===");
    console.log(JSON.stringify(out, null, 2));
    console.log("=== END calendar-test.json ===");
  } finally {
    await server.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCalendarTest({
    symbols: arg("symbols", "SPY,DIA").split(",").map((s) => s.trim()).filter(Boolean),
    start: arg("start", "1990-01-01"),
  }).catch((err) => {
    process.stderr.write(`${err instanceof Error ? err.stack : String(err)}\n`);
    process.exitCode = 1;
  });
}

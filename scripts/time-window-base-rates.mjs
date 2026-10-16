/**
 * Runs the pre-registered time-window base-rate test
 * (lib/research/timeWindowBaseRate.ts; PLAN.md item 7 step 6) on daily bars
 * from the platform's market-data provider and prints the result as JSON
 * between BEGIN/END markers. Research only: nothing here feeds a verdict.
 *
 *   node scripts/time-window-base-rates.mjs --symbols SPY,DIA
 *
 * In CI it rides the universe-backtest workflow with
 * `universe: time-window-base-rates` (a workflow must be on the default
 * branch to be dispatched): the harness hands off here and the test reads
 * the whole large-cap universe, paced at 30 symbols a minute.
 */

import { createServer } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIN_SESSIONS = 750;

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

export async function runTimeWindowBaseRates({ symbols = null, symbolsPerMinute = 30 } = {}) {
  const start = new Date("2000-01-01T00:00:00Z");
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
    const { LARGE_CAP_UNIVERSE } = await server.ssrLoadModule("/lib/scan/large-cap-universe.ts");
    const tw = await server.ssrLoadModule("/lib/research/timeWindowBaseRate.ts");
    const provider = getMarketDataProvider();
    const list = symbols ?? LARGE_CAP_UNIVERSE;
    const gapMs = symbolsPerMinute > 0 ? 60_000 / symbolsPerMinute : 0;
    const series = [];
    const skipped = [];
    let from = null;
    let to = null;
    for (const symbol of list) {
      const began = Date.now();
      try {
        const bars = await provider.fetchBars(symbol, "1Day", start, null, "us_equity");
        if (bars.length < MIN_SESSIONS) {
          skipped.push({ symbol, reason: `only ${bars.length} sessions` });
        } else {
          series.push(tw.symbolWindows(bars));
          const f = bars[0].t.slice(0, 10);
          const l = bars[bars.length - 1].t.slice(0, 10);
          if (from === null || f < from) from = f;
          if (to === null || l > to) to = l;
        }
      } catch (err) {
        skipped.push({ symbol, reason: err instanceof Error ? err.message : String(err) });
      }
      const wait = gapMs - (Date.now() - began);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    }
    const report = tw.readBaseRates(series);
    const out = { generatedAt: new Date().toISOString(), symbols: series.length, from, to, skipped, ...report };
    console.log("=== BEGIN time-window-base-rates.json ===");
    console.log(JSON.stringify(out, null, 2));
    console.log("=== END time-window-base-rates.json ===");
  } finally {
    await server.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const list = arg("symbols", null);
  runTimeWindowBaseRates({
    symbols: list ? list.split(",").map((s) => s.trim()).filter(Boolean) : null,
    symbolsPerMinute: Number(arg("symbolsPerMinute", "30")),
  }).catch((err) => {
    process.stderr.write(`${err instanceof Error ? err.stack : String(err)}\n`);
    process.exitCode = 1;
  });
}

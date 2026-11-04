/**
 * Runs lib/research/masterTimeCalculator.ts (does the public "master time
 * factor" calculator time the published calls, the Dow's turns or SPY's?)
 * and writes the run to docs/replay-runs/. Research only: nothing here feeds
 * a verdict.
 *
 *   node scripts/master-time-calculator.mjs [--out docs/replay-runs/<date>-master-time-calculator.json]
 */

import { createServer } from "vite";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const i = process.argv.indexOf("--out");
const out = i === -1 ? null : process.argv[i + 1];

const server = await createServer({
  configFile: false,
  root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "warn",
});
try {
  const r = await server.ssrLoadModule("/lib/research/masterTimeCalculator.ts");
  const spy = JSON.parse(readFileSync(path.join(root, "lib/research/spyDailyCloses.json"), "utf8"));
  const fix = (n) => +n.toFixed(4);
  const score = (s) => ({ hits: s.hits, total: s.total, expected: fix(s.expected), p: fix(s.p) });
  const configs = r.scoreCalculatorAll(spy.bars).map((m) => ({
    config: m.config,
    mode: m.mode,
    coverage: Object.fromEntries(Object.entries(m.coverage).map(([k, v]) => [k, fix(v)])),
    calls: score(m.calls),
    nine: score(m.nine),
    three: score(m.three),
    spy: Object.fromEntries(Object.entries(m.spy).map(([k, v]) => [k, score(v)])),
  }));
  const run = {
    run: "master-time-calculator",
    generated: new Date().toISOString().slice(0, 10),
    module: "lib/research/masterTimeCalculator.ts",
    source: "https://codingace.net/general/wd_gann_master_time_factor_cal.html",
    tests: r.CALCULATOR_TESTS,
    bonferroni: fix(0.05 / r.CALCULATOR_TESTS),
    spyBars: { from: spy.bars[0].date, to: spy.bars.at(-1).date, count: spy.bars.length, source: spy.source },
    configs,
    // The page's own default table, reproduced (base 2026-01-01, 30 days, 1.618, $100).
    example: r.calculatorRows("2026-01-01", 30, 1.618, 100),
  };
  const json = JSON.stringify(run, null, 2) + "\n";
  if (out) writeFileSync(path.resolve(root, out), json);
  else process.stdout.write(json);
} finally {
  await server.close();
}

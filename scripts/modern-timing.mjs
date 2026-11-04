/**
 * Runs lib/research/modernTiming.ts (the planetary batch on SPY and DIA,
 * 2016-2025) and writes the run to docs/replay-runs/. Research only.
 *
 *   node scripts/modern-timing.mjs [--out docs/replay-runs/<date>-modern-timing.json]
 */

import { createServer } from "vite";
import { writeFileSync } from "node:fs";
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
  const r = await server.ssrLoadModule("/lib/research/modernTiming.ts");
  const fix = (n) => +n.toFixed(4);
  const results = r.modernAll().map((m) => ({
    rule: m.rule,
    symbol: m.symbol,
    set: m.set,
    hits: m.score.hits,
    total: m.score.total,
    expected: fix(m.score.expected),
    p: fix(m.score.p),
  }));
  const run = {
    run: "modern-timing",
    generated: new Date().toISOString().slice(0, 10),
    module: "lib/research/modernTiming.ts",
    years: r.MODERN_YEARS,
    tests: r.MODERN_TESTS,
    results,
  };
  if (out) writeFileSync(path.resolve(root, out), JSON.stringify(run, null, 1) + "\n");
  for (const m of results) console.log(m.rule.padEnd(16), m.symbol, m.set.padEnd(5), m.hits, "/", m.total, "exp", m.expected, "p", m.p);
} finally {
  await server.close();
}

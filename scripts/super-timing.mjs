/**
 * Runs lib/research/superTiming.ts (does the timing formula in Walker's
 * *Super Timing* time the published calls, the Dow's turns 1913-1948, and
 * SPY's and DIA's 2016-2025?) and writes the run to docs/replay-runs/.
 * Research only: nothing here feeds a verdict.
 *
 *   node scripts/super-timing.mjs [--out docs/replay-runs/<date>-super-timing.json]
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
  const r = await server.ssrLoadModule("/lib/research/superTiming.ts");
  const fix = (n) => +n.toFixed(4);
  const results = r.superTimingAll().map((m) => ({
    rule: m.rule,
    set: m.set,
    coverage: fix(m.coverage),
    hits: m.score.hits,
    total: m.score.total,
    expected: fix(m.score.expected),
    p: fix(m.score.p),
  }));
  const run = {
    run: "super-timing",
    generated: new Date().toISOString().slice(0, 10),
    module: "lib/research/superTiming.ts",
    tests: r.SUPER_TESTS,
    cutoff: fix(0.05 / r.SUPER_TESTS),
    results,
  };
  if (out) writeFileSync(path.resolve(root, out), JSON.stringify(run, null, 1) + "\n");
  for (const m of results) console.log(m.rule.padEnd(15), m.set.padEnd(9), "cov", m.coverage, "|", m.hits, "/", m.total, "exp", m.expected, "p", m.p);
} finally {
  await server.close();
}

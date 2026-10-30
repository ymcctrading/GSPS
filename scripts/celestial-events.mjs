/**
 * Runs lib/research/celestialEvents.ts (do the public astronomical event
 * kinds time the published calls and the Dow's turns?) and writes the run to
 * docs/replay-runs/. Research only: nothing here feeds a verdict.
 *
 *   node scripts/celestial-events.mjs [--out docs/replay-runs/<date>-celestial-events.json]
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
  const r = await server.ssrLoadModule("/lib/research/celestialEvents.ts");
  const fix = (n) => +n.toFixed(4);
  const score = (s) => ({ hits: s.hits, total: s.total, expected: fix(s.expected), p: fix(s.p) });
  const rules = r.celestialAll().map((m) => ({
    rule: m.rule,
    tolerance: r.toleranceFor(m.rule),
    coverage: fix(m.coverage),
    calls: score(m.calls),
    nine: score(m.nine),
    three: score(m.three),
  }));
  const run = {
    run: "celestial-events",
    generated: new Date().toISOString().slice(0, 10),
    module: "lib/research/celestialEvents.ts",
    tests: r.CELESTIAL_TESTS,
    batchTests: r.BATCH_TESTS,
    rules,
  };
  if (out) writeFileSync(path.resolve(root, out), JSON.stringify(run, null, 1) + "\n");
  for (const m of rules)
    console.log(m.rule.padEnd(16), "cov", m.coverage, "| calls", m.calls.hits, "/", m.calls.total, "exp", m.calls.expected, "p", m.calls.p, "| nine", m.nine.hits, "/", m.nine.total, "exp", m.nine.expected, "p", m.nine.p, "| three", m.three.hits, "/", m.three.total, "exp", m.three.expected, "p", m.three.p);
} finally {
  await server.close();
}

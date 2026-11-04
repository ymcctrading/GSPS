/**
 * Runs lib/research/combinationTest.ts (do the timing rules work in
 * combination, chosen on the Dow 1913-1930 and scored only on spans they
 * haven't seen?) and writes the run to docs/replay-runs/. Research only:
 * nothing here feeds a verdict.
 *
 *   node scripts/combination-test.mjs [--out docs/replay-runs/<date>-combination-test.json]
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
  const r = await server.ssrLoadModule("/lib/research/combinationTest.ts");
  const fix = (n) => +n.toFixed(4);
  const res = r.runCombinationTest();
  const picks = res.picks.map((p) => ({
    combination: p.label,
    choose: { hits: p.choose.hits, total: p.choose.total, expected: fix(p.choose.expected), p: fix(p.choose.p), coverage: fix(p.choose.coverage) },
    tests: p.tests.map((t) => ({ record: t.record, hits: t.hits, total: t.total, expected: fix(t.expected), p: fix(t.p) })),
    calls: { hits: p.calls.hits, total: p.calls.total, expected: fix(p.calls.expected), p: fix(p.calls.p) },
  }));
  const run = {
    run: "combination-test",
    generated: new Date().toISOString().slice(0, 10),
    module: "lib/research/combinationTest.ts",
    features: r.FEATURES,
    chooseYears: r.CHOOSE_YEARS,
    considered: res.considered,
    kept: res.kept,
    tests: r.COMBO_TESTS,
    cutoff: fix(0.05 / r.COMBO_TESTS),
    picks,
  };
  if (out) writeFileSync(path.resolve(root, out), JSON.stringify(run, null, 1) + "\n");
  console.log("considered", res.considered, "kept", res.kept);
  for (const p of picks) {
    console.log(p.combination, "| choose", p.choose.hits, "/", p.choose.total, "exp", p.choose.expected, "p", p.choose.p, "cov", p.choose.coverage);
    for (const t of p.tests) console.log("   ", t.record.padEnd(9), t.hits, "/", t.total, "exp", t.expected, "p", t.p);
    console.log("    calls", p.calls.hits, "/", p.calls.total, "exp", p.calls.expected, "p", p.calls.p);
  }
} finally {
  await server.close();
}

/**
 * Runs lib/research/forecastRebuild.ts (can the built time methods rebuild
 * the published calls?) and writes the run to docs/replay-runs/. Research
 * only: nothing here feeds a verdict.
 *
 *   node scripts/forecast-rebuild.mjs [--out docs/replay-runs/<date>-forecast-rebuild.json]
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
  const r = await server.ssrLoadModule("/lib/research/forecastRebuild.ts");
  const fix = (n) => +n.toFixed(4);
  const row = (m) => ({
    method: m.method,
    anchors: m.anchorSet,
    calls: { hits: m.calls.hits, total: m.calls.total, expected: fix(m.calls.expected), p: fix(m.calls.p) },
    turns: { hits: m.turns.hits, total: m.turns.total, expected: fix(m.turns.expected), p: fix(m.turns.p) },
    years: m.years.map((y) => ({ ...y, coverage: fix(y.coverage), callsExpected: fix(y.callsExpected), turnsExpected: fix(y.turnsExpected) })),
  });
  const run = {
    run: "forecast-rebuild",
    generated: new Date().toISOString().slice(0, 10),
    module: "lib/research/forecastRebuild.ts",
    draws: r.DRAWS,
    primary: r.rebuildAll("nine").map(row),
    yearlyAnchors: r.rebuildAll("yearly").map(row),
  };
  if (out) writeFileSync(path.resolve(root, out), JSON.stringify(run, null, 1) + "\n");
  for (const m of [...run.primary, ...run.yearlyAnchors])
    console.log(m.anchors.padEnd(7), m.method.padEnd(14), "calls", m.calls.hits, "/", m.calls.total, "exp", m.calls.expected, "p", m.calls.p, "| turns", m.turns.hits, "/", m.turns.total, "exp", m.turns.expected, "p", m.turns.p);
} finally {
  await server.close();
}

/**
 * Runs lib/research/timeProcedures.ts on its held-out span (Rules A to D,
 * frozen, scored against their matched controls and kill criteria) and
 * writes the run to docs/replay-runs/. Research only: nothing here feeds a
 * verdict.
 *
 *   node scripts/time-procedures.mjs [--out docs/replay-runs/<date>-time-procedures.json]
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
  const r = await server.ssrLoadModule("/lib/research/timeProcedures.ts");
  const fix = (n) => +n.toFixed(5);
  const res = r.heldOutRun();
  const run = {
    run: "time-procedures",
    generated: new Date().toISOString().slice(0, 10),
    module: "lib/research/timeProcedures.ts",
    heldOut: r.HELD_OUT,
    tests: r.PROCEDURE_TESTS,
    cutoff: fix(r.PROCEDURE_CUTOFF),
    turns: res.turns.map((t) => ({ ...t, expected: fix(t.expected), p: fix(t.p) })),
    overlays: res.overlays.map((o) => ({ ...o, mean: fix(o.mean), controlMean: fix(o.controlMean), p: fix(o.p) })),
    verdicts: res.verdicts,
  };
  if (out) writeFileSync(path.resolve(root, out), JSON.stringify(run, null, 1) + "\n");
  for (const t of run.turns) console.log("turns", t.rule.padEnd(3), t.symbol, "windows", t.windows, "conflicts", t.conflicts, "hits", t.hits, "exp", t.expected, "p", t.p);
  for (const o of run.overlays) console.log("D on", o.rule, o.symbol, "trades", o.trades, "mean", o.mean, "| control", o.controlTrades, "mean", o.controlMean, "p", o.p);
  console.log(run.verdicts);
} finally {
  await server.close();
}

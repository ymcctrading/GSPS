/**
 * Runs lib/research/horaTiming.ts (Hora and Choghadiya against SPY's and
 * DIA's daily high and low times, 2016-2025) under both nulls and writes the
 * run to docs/replay-runs/. Research only.
 *
 *   node scripts/hora-timing.mjs [--out docs/replay-runs/<date>-hora-timing.json]
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
  const r = await server.ssrLoadModule("/lib/research/horaTiming.ts");
  const fix = (n) => +n.toFixed(4);
  const row = (m) => ({
    symbol: m.symbol,
    null: m.nullModel,
    sessions: m.sessions,
    turns: m.turns,
    bad: { observed: m.bad.observed, expected: fix(m.bad.expected), p: fix(m.bad.p) },
    good: { observed: m.good.observed, expected: fix(m.good.expected), p: fix(m.good.p) },
    hora: { rulers: r.CHALDEAN, observed: m.hora.observed, expected: m.hora.expected.map(fix), chi2: fix(m.hora.chi2), p: fix(m.hora.p) },
  });
  const run = {
    run: "hora-timing",
    generated: new Date().toISOString().slice(0, 10),
    module: "lib/research/horaTiming.ts",
    tests: r.HORA_TESTS,
    draws: r.HORA_DRAWS,
    test: r.horaAll("sameWeekday").map(row),
    comparison: r.horaAll("rotateLord").map(row),
  };
  if (out) writeFileSync(path.resolve(root, out), JSON.stringify(run, null, 1) + "\n");
  for (const m of [...run.test, ...run.comparison])
    console.log(m.null.padEnd(11), m.symbol, "bad", m.bad.observed, m.bad.expected, m.bad.p, "| good", m.good.observed, m.good.expected, m.good.p, "| hora", m.hora.chi2, m.hora.p);
} finally {
  await server.close();
}

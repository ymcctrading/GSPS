/**
 * Runs lib/research/aspectTiming.ts (do planetary aspects time the published
 * calls and the Dow's turns?) and writes the run to docs/replay-runs/.
 * Research only: nothing here feeds a verdict.
 *
 *   node scripts/aspect-timing.mjs [--out docs/replay-runs/<date>-aspect-timing.json]
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
  const r = await server.ssrLoadModule("/lib/research/aspectTiming.ts");
  const fix = (n) => +n.toFixed(4);
  const score = (s) => ({ hits: s.hits, total: s.total, expected: fix(s.expected), p: fix(s.p) });
  const rules = r.aspectTimingAll().map((m) => ({
    rule: m.rule,
    coverage: { calls: fix(m.coverage.calls), nine: fix(m.coverage.nine), three: fix(m.coverage.three) },
    calls: score(m.calls),
    nine: score(m.nine),
    three: score(m.three),
  }));
  const near = (d) => r.aspectsNear(d).map((e) => `${e.date} ${e.a}-${e.b} ${e.angle}`);
  const run = {
    run: "aspect-timing",
    generated: new Date().toISOString().slice(0, 10),
    module: "lib/research/aspectTiming.ts",
    tests: r.ASPECT_TESTS,
    rules,
    // The turns the shared videos read, with every exact aspect within the tolerance. Illustration, not a test.
    callMatches: Object.fromEntries(
      ["slowPairs", "outerPairs"].map((rule) => [
        rule,
        r.callAspectMatches(rule).map((m) => ({ forecast: m.forecast, call: m.label, hit: m.hit, aspects: m.aspects.map((e) => `${e.date} ${e.a}-${e.b} ${e.angle}`) })),
      ]),
    ),
    // The grand cross plus grand trine ("symbol") rule: how often it occurs at all, and the two dates the videos name.
    symbolRate: {
      eightBodies: r.grandFigureRate("1900-01-01", "1949-12-31", 1, 1),
      withMoonAndPluto: r.grandFigureRate("1900-01-01", "1949-12-31", 1, 1, true),
    },
    symbolDates: Object.fromEntries(
      ["1908-08-08", "1909-09-30"].map((d) => [d, { eightBodies: r.grandFigures(d), withMoonAndPluto: r.grandFigures(d, true) }]),
    ),
    examples: {
      "1908-08-08": near("1908-08-08"),
      "1909-09-30 wheat": near("1909-09-30"),
      "1921-08-24 low": near("1921-08-24"),
      "1922-10-14 top": near("1922-10-14"),
      "1923-11-30 cotton top (the $973 account's short began)": near("1923-11-30"),
      "1929-09-03 top": near("1929-09-03"),
      "1932-07-08 low": near("1932-07-08"),
      "1932-09-07 top": near("1932-09-07"),
      "1932-10-10 low": near("1932-10-10"),
    },
  };
  if (out) writeFileSync(path.resolve(root, out), JSON.stringify(run, null, 1) + "\n");
  for (const m of rules)
    console.log(m.rule.padEnd(11), "cov", m.coverage.nine, "| calls", m.calls.hits, "/", m.calls.total, "exp", m.calls.expected, "p", m.calls.p, "| nine", m.nine.hits, "/", m.nine.total, "exp", m.nine.expected, "p", m.nine.p, "| three", m.three.hits, "/", m.three.total, "exp", m.three.expected, "p", m.three.p);
  for (const [rule, ms] of Object.entries(run.callMatches))
    console.log(rule, "calls met", ms.length, "of which caught a turn", ms.filter((m) => m.hit).length);
  console.log(JSON.stringify(run.examples, null, 1));
} finally {
  await server.close();
}

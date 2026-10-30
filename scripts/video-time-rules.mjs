/**
 * Runs lib/research/videoTimeRules.ts (the time counts from the owner's eight
 * further videos) and writes the run to docs/replay-runs/. Research only.
 *
 *   node scripts/video-time-rules.mjs [--out docs/replay-runs/<date>-video-time-rules.json]
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
  const r = await server.ssrLoadModule("/lib/research/videoTimeRules.ts");
  const fix = (n) => +n.toFixed(4);
  const results = r.videoAll().map((m) => ({
    rule: m.rule,
    outcome: m.outcome,
    coverage: fix(m.coverage),
    hits: m.score.hits,
    total: m.score.total,
    expected: fix(m.score.expected),
    p: fix(m.score.p),
  }));
  const run = {
    run: "video-time-rules",
    generated: new Date().toISOString().slice(0, 10),
    module: "lib/research/videoTimeRules.ts",
    tests: r.VIDEO_TESTS,
    results,
  };
  if (out) writeFileSync(path.resolve(root, out), JSON.stringify(run, null, 1) + "\n");
  for (const m of results) console.log(m.rule.padEnd(14), m.outcome.padEnd(9), "cov", m.coverage, m.hits, "/", m.total, "exp", m.expected, "p", m.p);
} finally {
  await server.close();
}

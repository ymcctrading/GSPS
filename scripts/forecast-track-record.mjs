/**
 * Scores the published forecasts and the macro cycle
 * (lib/research/forecastTrackRecord.ts) and writes the run to
 * docs/replay-runs/. Research only: nothing here feeds a verdict.
 *
 *   node scripts/forecast-track-record.mjs [--out docs/replay-runs/<date>-forecast-track-record.json]
 */

import { createServer } from "vite";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

const server = await createServer({
  configFile: false,
  root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "warn",
});
try {
  const r = await server.ssrLoadModule("/lib/research/forecastTrackRecord.ts");
  const brief = (s) => ({ hits: s.hits, calls: s.calls.length, expected: +s.expected.toFixed(2), hitRate: +s.hitRate.toFixed(3), baseMean: +s.baseMean.toFixed(3), p: +s.p.toFixed(4) });
  const permanent = (from, to, set) => brief(r.scoreCalls(r.permanentDateWindows(from, to, set), set));
  const years = r.scorePublishedForecasts();
  const macro = r.macroCycleRecord();
  const run = {
    run: "forecast-track-record",
    generated: new Date().toISOString().slice(0, 10),
    module: "lib/research/forecastTrackRecord.ts",
    publishedForecasts: {
      byYear: years.map((y) => ({ id: y.id, issued: y.issued, source: y.source, nine: brief(y.nine), three: brief(y.three) })),
      pooled: { nine: brief(r.pooledForecastScore("nine")), three: brief(r.pooledForecastScore("three")) },
      calls: years.flatMap((y) =>
        y.nine.calls.map((c, i) => ({
          forecast: y.id,
          label: c.label,
          from: c.from,
          to: c.to,
          expect: c.expect,
          nine: { hit: c.hit, turn: c.turn, daysOff: c.daysOff, baseRate: +c.baseRate.toFixed(3) },
          three: { hit: y.three.calls[i].hit, turn: y.three.calls[i].turn, daysOff: y.three.calls[i].daysOff, baseRate: +y.three.calls[i].baseRate.toFixed(3) },
        })),
      ),
    },
    permanentChangeDates: {
      beforeIssue_1913_1928: { nine: permanent(1913, 1928, "nine"), three: permanent(1913, 1928, "three") },
      afterIssue_1929_1949: { nine: permanent(1929, 1949, "nine"), three: permanent(1929, 1949, "three") },
    },
    selfScoredClaims: r.checkSelfScoredClaims(),
    macroCycle: macro.map((s) => ({
      label: s.label,
      windows: s.windows.length,
      hits: s.hits,
      expected: +s.expected.toFixed(2),
      hitRate: +s.hitRate.toFixed(3),
      baseMean: +s.baseMean.toFixed(3),
      baseRate: { high: +s.baseRate.high.toFixed(3), low: +s.baseRate.low.toFixed(3) },
      p: +s.p.toFixed(4),
      detail: s.windows.map((w) => ({ month: w.month, anchor: w.anchor, kind: w.kind, lengths: w.majorCycleYears, hit: w.hit, turn: w.turn })),
    })),
    projection: r.projectMacroWindows(2026, 2110, 4).map((w) => ({ month: w.month, anchor: w.anchor, years: w.yearsElapsed, lengths: w.majorCycleYears, expect: w.bullish ? "low" : "high" })),
  };
  const out = arg("out", null);
  if (out) writeFileSync(path.resolve(root, out), JSON.stringify(run, null, 1) + "\n");
  console.log(JSON.stringify({ ...run, publishedForecasts: { ...run.publishedForecasts, calls: undefined }, macroCycle: run.macroCycle.map((m) => ({ ...m, detail: undefined })) }, null, 1));
} finally {
  await server.close();
}

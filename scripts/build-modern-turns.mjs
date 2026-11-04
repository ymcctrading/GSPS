/**
 * Builds lib/research/modernTurns.json: SPY's and DIA's turns from Alpaca
 * daily bars (split-adjusted, SIP), for the planetary batch's modern check.
 * Research only: nothing here feeds a verdict.
 *
 *   node scripts/build-modern-turns.mjs <dir with SPY.ndjson and DIA.ndjson>
 *
 * Each .ndjson line is one session {t, o, h, l, c} from
 * /v2/stocks/bars?timeframe=1Day&adjustment=split&feed=sip.
 * Turns, fixed before scoring:
 * - three: every 3-Day Chart top and bottom (`swingChart.ts#THREE_DAY_CHART`),
 *   the same chart Gann's own 3-day table records;
 * - major: a high (low) that is the highest high (lowest low) of the 21
 *   sessions on each side, an engineering choice standing in for the
 *   9-point table's "important" swings at today's prices.
 */
import { createServer } from "vite";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = process.argv[2];
const SIDE = 21;

const server = await createServer({
  configFile: false,
  root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "warn",
});
try {
  const sc = await server.ssrLoadModule("/lib/gann/swingChart.ts");
  const out = { source: "Alpaca /v2/stocks/bars 1Day, adjustment=split, feed=sip", majorSide: SIDE, symbols: {} };
  for (const s of ["SPY", "DIA"]) {
    const bars = readFileSync(path.join(dir, `${s}.ndjson`), "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l))
      .map((b) => ({ t: `${b.t}T00:00:00Z`, o: b.o, h: b.h, l: b.l, c: b.c, v: 0 }));
    const walk = sc.walkSwingChart(bars, sc.THREE_DAY_CHART);
    const three = walk.pivots.map((p) => ({ date: bars[p.index].t.slice(0, 10), price: p.price, kind: p.kind === "top" ? "high" : "low" }));
    const major = [];
    for (let i = SIDE; i + SIDE < bars.length; i++) {
      const w = bars.slice(i - SIDE, i + SIDE + 1);
      if (bars[i].h === Math.max(...w.map((b) => b.h))) major.push({ date: bars[i].t.slice(0, 10), price: bars[i].h, kind: "high" });
      if (bars[i].l === Math.min(...w.map((b) => b.l))) major.push({ date: bars[i].t.slice(0, 10), price: bars[i].l, kind: "low" });
    }
    out.symbols[s] = { from: bars[0].t.slice(0, 10), to: bars.at(-1).t.slice(0, 10), three, major };
    console.log(s, bars.length, "sessions,", three.length, "3-day turns,", major.length, "major turns");
  }
  writeFileSync(path.join(root, "lib/research/modernTurns.json"), JSON.stringify(out) + "\n");
} finally {
  await server.close();
}

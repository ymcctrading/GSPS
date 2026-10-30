/**
 * Builds lib/research/modernDailyBars.json: SPY's and DIA's daily opens and
 * closes from Alpaca (split-adjusted, SIP), for the frozen time procedures in
 * lib/research/timeProcedures.ts. Research only: nothing here feeds a verdict.
 *
 *   node scripts/build-modern-closes.mjs <dir with SPY.ndjson and DIA.ndjson>
 *
 * Each .ndjson line is one session {t, o, h, l, c} from
 * /v2/stocks/bars?timeframe=1Day&adjustment=split&feed=sip (the same files
 * scripts/build-modern-turns.mjs reads).
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = process.argv[2];
const out = { source: "Alpaca /v2/stocks/bars 1Day, adjustment=split, feed=sip", columns: ["date", "open", "close"], symbols: {} };
for (const s of ["SPY", "DIA"]) {
  const seen = new Map();
  for (const l of readFileSync(path.join(dir, `${s}.ndjson`), "utf8").trim().split("\n")) {
    const b = JSON.parse(l);
    seen.set(b.t.slice(0, 10), [b.t.slice(0, 10), +b.o.toFixed(4), +b.c.toFixed(4)]);
  }
  out.symbols[s] = [...seen.values()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  console.log(s, out.symbols[s].length, "sessions", out.symbols[s][0][0], "to", out.symbols[s].at(-1)[0]);
}
writeFileSync(path.join(root, "lib/research/modernDailyBars.json"), JSON.stringify(out) + "\n");

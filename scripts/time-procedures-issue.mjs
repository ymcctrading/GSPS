/**
 * Issues next month's windows for every frozen time procedure
 * (lib/research/timeProcedures.ts) and appends them to
 * lib/research/timeProcedureLog.json, so live results can disprove them.
 * Research only: nothing here feeds a verdict or reaches a member.
 *
 *   NODE_USE_ENV_PROXY=1 ALPACA_API_KEY=via-proxy ALPACA_API_SECRET=via-proxy \
 *     node scripts/time-procedures-issue.mjs
 *
 * Run it after the last session of a month has closed and before the next
 * month opens. It refreshes lib/research/modernDailyBars.json from Alpaca
 * (daily, split-adjusted, SIP), refuses if the last session's month is not
 * over on the calendar's last weekday, or if that month was already issued,
 * and never edits an earlier entry.
 */
import { createServer } from "vite";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const barsFile = path.join(root, "lib/research/modernDailyBars.json");
const logFile = path.join(root, "lib/research/timeProcedureLog.json");
const headers = { "APCA-API-KEY-ID": process.env.ALPACA_API_KEY ?? "via-proxy", "APCA-API-SECRET-KEY": process.env.ALPACA_API_SECRET ?? "via-proxy" };

async function fetchBars(symbol) {
  const rows = [];
  let token = null;
  do {
    const u = new URL("https://data.alpaca.markets/v2/stocks/bars");
    u.search = new URLSearchParams({ symbols: symbol, timeframe: "1Day", start: "2016-01-01", adjustment: "split", feed: "sip", limit: "10000", ...(token ? { page_token: token } : {}) });
    const res = await fetch(u, { headers });
    if (!res.ok) throw new Error(`Alpaca ${res.status}: ${await res.text()}`);
    const j = await res.json();
    for (const b of j.bars?.[symbol] ?? []) rows.push([b.t.slice(0, 10), +b.o.toFixed(4), +b.c.toFixed(4)]);
    token = j.next_page_token;
  } while (token);
  return rows;
}

const bars = JSON.parse(readFileSync(barsFile, "utf8"));
for (const s of ["SPY", "DIA"]) bars.symbols[s] = await fetchBars(s);
const last = bars.symbols.DIA.at(-1)[0];
if (bars.symbols.SPY.at(-1)[0] !== last) throw new Error("SPY and DIA end on different sessions");
// The month is over only when no weekday after the last session remains in it (holidays aside, checked by hand).
const d = new Date(`${last}T00:00:00Z`);
for (let x = new Date(d.getTime() + 86_400_000); x.getUTCMonth() === d.getUTCMonth(); x.setUTCDate(x.getUTCDate() + 1)) {
  const wd = x.getUTCDay();
  if (wd !== 0 && wd !== 6) throw new Error(`${last} is not the month's last session: ${x.toISOString().slice(0, 10)} is still to come`);
}
writeFileSync(barsFile, JSON.stringify(bars) + "\n");

const server = await createServer({ configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true }, appType: "custom", logLevel: "warn" });
try {
  const r = await server.ssrLoadModule("/lib/research/timeProcedures.ts");
  const log = JSON.parse(readFileSync(logFile, "utf8"));
  const ym = last.slice(0, 7);
  if (log.entries.some((e) => e.issued.startsWith(ym))) throw new Error(`${ym} already issued`);
  const recordedAt = new Date().toISOString();
  for (const symbol of r.PROCEDURE_SYMBOLS) {
    const s = r.seriesFor(symbol);
    const pivots = r.confirmedPivots(s);
    const e = s.dates.length - 1;
    for (const rule of r.PROCEDURE_RULES) {
      // Projected dates, before their sessions exist; the scorer builds the windows once they do.
      const projections = r.projectionsAt(rule, s, e, pivots);
      log.entries.push({ recordedAt, issued: last, rule, symbol, projections });
      console.log(symbol, rule, projections.length ? projections.map((p) => `${p.direction} ${p.date}`).join(", ") : "none");
    }
  }
  writeFileSync(logFile, JSON.stringify(log, null, 1) + "\n");
} finally {
  await server.close();
}

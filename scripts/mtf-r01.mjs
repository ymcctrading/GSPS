/**
 * MTF-R0.1 runner (owner-private research; nothing here feeds a verdict,
 * plan or order, or reaches a member). See docs/research/mtf-r0-1/.
 *
 *   NODE_USE_ENV_PROXY=1 ALPACA_API_KEY=via-proxy ALPACA_API_SECRET=via-proxy \
 *     node scripts/mtf-r01.mjs snapshot --dir <dir>
 *   node scripts/mtf-r01.mjs evaluate --dir <dir> [--dow <DJA.csv>] [--only DIA|SPY|DJIA] --out <file>
 *   node scripts/mtf-r01.mjs issue --dir <dir> --ledger <forward-ledger.jsonl>
 *
 * snapshot: daily SPY and DIA bars from Alpaca (split-adjusted, SIP) into
 *   <dir>/<SYMBOL>.json with a SHA-256 manifest. A bar for today's New York
 *   date is dropped unless the session closed more than 30 minutes ago, so an
 *   unfinished session is never an input.
 * evaluate: the preregistered development run.
 * issue: this week's forward issue, appended to the ledger (refuses a week
 *   already issued, a session that is not its week's last by the exchange
 *   calendar, or a snapshot that does not end on the last closed session).
 */
import { createServer } from "vite";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [cmd, ...rest] = process.argv.slice(2);
const arg = (k, d) => {
  const i = rest.indexOf(`--${k}`);
  return i >= 0 ? rest[i + 1] : d;
};
const sha = (s) => createHash("sha256").update(s).digest("hex");
const SYMBOLS = ["DIA", "SPY"];
const headers = { "APCA-API-KEY-ID": process.env.ALPACA_API_KEY ?? "via-proxy", "APCA-API-SECRET-KEY": process.env.ALPACA_API_SECRET ?? "via-proxy" };

function nyNow() {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
  const p = Object.fromEntries(f.formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

async function fetchBars(symbol) {
  const rows = [];
  let token = null;
  do {
    const u = new URL("https://data.alpaca.markets/v2/stocks/bars");
    u.search = new URLSearchParams({ symbols: symbol, timeframe: "1Day", start: "2016-01-01", adjustment: "split", feed: "sip", limit: "10000", ...(token ? { page_token: token } : {}) });
    const res = await fetch(u, { headers });
    if (!res.ok) throw new Error(`Alpaca ${res.status}: ${await res.text()}`);
    const j = await res.json();
    for (const b of j.bars?.[symbol] ?? []) rows.push([b.t.slice(0, 10), b.o, b.h, b.l, b.c, b.v]);
    token = j.next_page_token;
  } while (token);
  // Daily bars are labelled by their New York session date (Alpaca stamps them at 04:00 or 05:00 UTC).
  const now = nyNow();
  const closed = (t) => t < now.date || (t === now.date && now.minutes >= 16 * 60 + 30);
  return rows.filter((r) => closed(r[0]));
}

function loadSnapshot(dir) {
  const manifest = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8"));
  const out = {};
  for (const s of SYMBOLS) {
    const text = readFileSync(path.join(dir, `${s}.json`), "utf8");
    if (sha(text) !== manifest.files[s]) throw new Error(`${s}.json does not match its manifest hash`);
    out[s] = { symbol: s, bars: JSON.parse(text).map(([t, o, h, l, c, v]) => ({ t, o, h, l, c, v })), snapshotHash: manifest.files[s], source: manifest.source };
  }
  return out;
}

function loadDow(file) {
  const text = readFileSync(file, "utf8");
  const bars = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^"(\d{1,2})\/(\d{1,2})\/(\d{4})","([0-9.]+)"$/);
    if (!m) continue;
    const t = `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
    const c = Number(m[4]);
    bars.push({ t, o: c, h: c, l: c, c, v: 0 });
  }
  return { symbol: "DJIA", bars, snapshotHash: sha(text), source: "MeasuringWorth DJA daily closes (owner upload), close only" };
}

async function withServer(fn) {
  const server = await createServer({ configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true }, appType: "custom", logLevel: "warn" });
  try {
    return await fn(server);
  } finally {
    await server.close();
  }
}

if (cmd === "snapshot") {
  const dir = arg("dir");
  mkdirSync(dir, { recursive: true });
  const files = {};
  for (const s of SYMBOLS) {
    const text = JSON.stringify(await fetchBars(s));
    writeFileSync(path.join(dir, `${s}.json`), text);
    files[s] = sha(text);
  }
  const manifest = { source: "Alpaca /v2/stocks/bars 1Day, adjustment=split, feed=sip", fetchedAt: new Date().toISOString(), files };
  writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 1) + "\n");
  console.log(JSON.stringify(manifest, null, 1));
} else if (cmd === "evaluate") {
  const snap = loadSnapshot(arg("dir"));
  const dow = arg("dow") ? loadDow(arg("dow")) : null;
  await withServer(async (server) => {
    const ev = await server.ssrLoadModule("/lib/research/mtfEvaluate.ts");
    const seed = 20261104;
    const results = [];
    const only = arg("only");
    for (const s of SYMBOLS) {
      if (only && only !== s) continue;
      const t0 = Date.now();
      results.push(ev.evaluateSeries(snap[s], { from: "2016-07-01", to: "2099-12-31", closeOnly: false, seed, n1: true, n3: true }));
      console.error(`${s} done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    }
    if (dow && (!only || only === "DJIA")) {
      const t0 = Date.now();
      results.push(ev.evaluateSeries(dow, { from: "1897-01-01", to: "2099-12-31", closeOnly: true, seed, n1: true, n3: true }));
      console.error(`DJIA done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    }
    const out = { version: "MTF-R0.1", ranAt: new Date().toISOString(), preregistration: "docs/research/mtf-r0-1/PREREGISTRATION.md", results };
    writeFileSync(arg("out"), JSON.stringify(out, null, 1) + "\n");
    for (const r of results) {
      const t = r.arms.r01.tally;
      console.log(`${r.symbol}: issues ${r.span.issues}, majors ${r.span.majorAnchors}, R0.1 windows ${t.windows} (unresolved ${t.unresolved}), direction hits ${t.directionHits}, N2 expected ${r.n2.r01.expectedHits.toFixed(2)} p ${r.n2.r01.p.toFixed(4)}; N1 p ${r.n1?.p.toFixed(3)}; N3 p ${r.n3?.p.toFixed(3)}; trades ${r.trades.trades} mean ${(r.trades.mean * 100).toFixed(3)}% vs control ${(r.trades.controlMean * 100).toFixed(3)}% p ${r.trades.p.toFixed(4)}`);
    }
  });
} else if (cmd === "issue") {
  const snap = loadSnapshot(arg("dir"));
  const ledger = arg("ledger");
  await withServer(async (server) => {
    const ad = await server.ssrLoadModule("/lib/research/mtfAdapter.ts");
    const en = await server.ssrLoadModule("/lib/research/mtfCandidate.ts");
    const cal = await server.ssrLoadModule("/lib/market/calendar.ts");
    const lines = existsSync(ledger) ? readFileSync(ledger, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
    let prev = lines.length ? sha(JSON.stringify(lines.at(-1))) : "genesis";
    // The exchange calendar, not the data, decides the week's and month's last session.
    const nextSession = (iso) => {
      let d = new Date(`${iso}T12:00:00Z`);
      do d = new Date(d.getTime() + 86_400_000);
      while (!cal.isTradingDay(d));
      return d.toISOString().slice(0, 10);
    };
    const week = (iso) => Math.floor((Date.parse(`${iso}T00:00:00Z`) / 86_400_000 + 3) / 7);
    for (const s of SYMBOLS) {
      const series = snap[s];
      const dates = series.bars.map((b) => b.t);
      const e = dates.length - 1;
      const issue = dates[e];
      const now = nyNow();
      if (issue > now.date || (issue === now.date && now.minutes < 16 * 60 + 30)) throw new Error(`${issue} has not closed`);
      const after = nextSession(issue);
      if (after < now.date || (after === now.date && now.minutes >= 16 * 60 + 30)) throw new Error(`${s} snapshot ends ${issue}, but ${after} has closed; take a fresh snapshot`);
      if (after === now.date) throw new Error(`${after}'s session is still open; issue after it closes`);
      if (week(nextSession(issue)) === week(issue)) throw new Error(`${issue} is not its week's last session`);
      if (lines.some((l) => l.symbol === s && l.issueSession === issue)) throw new Error(`${s} ${issue} already issued`);
      const p = ad.prepare(series);
      const monthEnd = (i) => (i < e ? dates[i + 1].slice(0, 7) !== dates[i].slice(0, 7) : nextSession(dates[i]).slice(0, 7) !== dates[i].slice(0, 7));
      const input = ad.buildInput(p, e, monthEnd);
      const output = en.runR01(input);
      const entry = { recordedAt: new Date().toISOString(), symbol: s, issueSession: issue, input, output, prev };
      appendFileSync(ledger, JSON.stringify(entry) + "\n");
      prev = sha(JSON.stringify(entry));
      console.log(`${s} ${issue}: ${output.status}${output.windows.length ? " " + output.windows.map((w) => `${w.start}..${w.end}`).join(", ") : ""} (${output.expectedType}, coverage ${(output.coverage * 100).toFixed(1)}%)`);
    }
  });
} else {
  console.error("usage: node scripts/mtf-r01.mjs snapshot|evaluate|issue ...");
  process.exit(2);
}

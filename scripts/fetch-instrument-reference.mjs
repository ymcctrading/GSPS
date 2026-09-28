#!/usr/bin/env node
/**
 * Fetches the two per-symbol facts Gann's volume and time rules need, once,
 * for the scan universe, and stores them (migration 0083):
 *
 *   D2 · shares outstanding ("capital stock") from SEC EDGAR XBRL
 *   D3 · incorporation / founding date from Wikidata P571, matched by SEC CIK
 *
 * Nothing in the app calls SEC or Wikidata. The scans read the stored rows
 * (`lib/data/instrumentReference.ts`). Re-run this to refresh, e.g. once a
 * quarter after the 10-Q season. Rows are upserted, so a re-run is safe.
 *
 * Usage:
 *   SEC_USER_AGENT="Name contact@example.com" node scripts/fetch-instrument-reference.mjs \
 *     [--symbols AAPL,MSFT] [--out tmp/instrument-reference.json] [--sql tmp/instrument-reference.sql] [--apply]
 *
 *   --symbols  default: the scan universe (MAG7, the sector lists and
 *              LARGE_CAP_UNIVERSE, read from the source files)
 *   --out      JSON of every record fetched (default tmp/instrument-reference.json)
 *   --sql      also write idempotent upsert SQL to this path
 *   --apply    upsert straight into Supabase with the service role key, taken
 *              from SUPABASE_SERVICE_ROLE_KEY, or, when that is unset, from a
 *              Claude Code API credential attached to requests for the
 *              Supabase host. NEXT_PUBLIC_SUPABASE_URL overrides the project URL.
 *
 * In a Claude Code cloud session, run it with NODE_USE_ENV_PROXY=1. Node's
 * built-in fetch otherwise bypasses the sandbox proxy, which is what attaches
 * the Supabase credential.
 *
 * SEC asks for a descriptive User-Agent with a contact and at most 10
 * requests a second (https://www.sec.gov/os/accessing-edgar-data). This keeps
 * to about 8.
 *
 * Choices made here, each also noted where the data is read:
 * - Shares: the cover-page count (dei:EntityCommonStockSharesOutstanding)
 *   first. SEC's API leaves out per-class facts, so companies that report by
 *   share class (Alphabet, Berkshire) have none or a stale one. For those it
 *   falls back to the balance-sheet count (us-gaap:CommonStockSharesOutstanding),
 *   then to basic weighted-average shares. Where one filing reports several
 *   values for the same date they are summed (all classes together, which is
 *   Gann's "capital stock").
 * - A count older than 18 months is not stored as current. It is almost
 *   always a filer that stopped reporting that tag. A count under a million
 *   shares is dropped too (a subsidiary or shell filer, or a mis-scaled
 *   fact), and the next concept is tried.
 * - Foreign private issuers filing 20-F are skipped for shares. They report
 *   ordinary shares, while the US listing trades ADRs at a ratio SEC's API
 *   doesn't give, so volume ÷ shares would be wrong by that ratio.
 * - Inception: Wikidata's P571 statements for the item carrying the CIK
 *   (P5531). Deprecated statements are dropped; then preferred rank, then the
 *   finest precision, then the earliest date. The precision is stored,
 *   because a year-only date has no anniversary day.
 */

import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const UA = process.env.SEC_USER_AGENT;
if (!UA) {
  console.error("Set SEC_USER_AGENT (a name and contact email, as SEC requires) and re-run.");
  process.exit(1);
}

const args = { symbols: null, out: "tmp/instrument-reference.json", sql: null, apply: false };
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === "--apply") args.apply = true;
  else if (a === "--symbols") args.symbols = process.argv[++i].split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  else if (a === "--out") args.out = process.argv[++i];
  else if (a === "--sql") args.sql = process.argv[++i];
  else {
    console.error(`Unknown argument ${a}`);
    process.exit(1);
  }
}

const SHARES_HISTORY_SINCE = "2015-01-01";
const STALE_MONTHS = 18;
// No listed large cap has under a million shares; a smaller figure is a
// subsidiary or shell filer's count (seen: 1,000) or a mis-scaled fact.
const MIN_SHARES = 1_000_000;
const SHARE_CONCEPTS = [
  ["dei", "EntityCommonStockSharesOutstanding"],
  ["us-gaap", "CommonStockSharesOutstanding"],
  ["us-gaap", "WeightedAverageNumberOfSharesOutstandingBasic"],
];

function universeFromSource() {
  const quoted = (text) => [...text.matchAll(/"([A-Z][A-Z0-9.\-]{0,9})"/g)].map((m) => m[1]);
  const largeCap = readFileSync(path.join(root, "lib/scan/large-cap-universe.ts"), "utf8");
  const start = largeCap.indexOf("export const LARGE_CAP_UNIVERSE");
  const body = largeCap.slice(start, largeCap.indexOf("];", start));
  const sectors = readFileSync(path.join(root, "lib/sectors.ts"), "utf8");
  return [...new Set([...quoted(sectors), ...quoted(body)])].filter((s) => !s.includes("/"));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastSec = 0;
async function secGet(url) {
  const wait = lastSec + 125 - Date.now();
  if (wait > 0) await sleep(wait);
  lastSec = Date.now();
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (res.status === 404) return null;
    if (res.ok) return res.json();
    if (res.status === 429 || res.status >= 500) {
      await sleep(2000 * 2 ** attempt);
      continue;
    }
    throw new Error(`${url}: HTTP ${res.status}`);
  }
  throw new Error(`${url}: gave up after retries`);
}

const monthsBetween = (a, b) => (Date.parse(b) - Date.parse(a)) / (30.44 * 24 * 3600 * 1000);

/** One value per (filing, date): classes reported separately are summed. */
function shareSeries(concept) {
  // SEC sends {} rather than [] when a concept has no facts.
  const rows = Array.isArray(concept?.units?.shares) ? concept.units.shares : [];
  const byKey = new Map();
  for (const r of rows) {
    if (!(r.val > 0) || !r.end || !r.filed) continue;
    const key = `${r.accn}|${r.end}`;
    const prev = byKey.get(key);
    if (prev) prev.shares += r.val;
    else byKey.set(key, { as_of: r.end, filed: r.filed, shares: r.val, form: r.form ?? null, accession: r.accn ?? null });
  }
  return [...byKey.values()].sort((a, b) => a.filed.localeCompare(b.filed) || a.as_of.localeCompare(b.as_of));
}

async function fetchShares(cik10, today) {
  for (const [tax, tag] of SHARE_CONCEPTS) {
    const concept = await secGet(`https://data.sec.gov/api/xbrl/companyconcept/CIK${cik10}/${tax}/${tag}.json`);
    const series = shareSeries(concept);
    if (series.length === 0) continue;
    const latest = series[series.length - 1];
    const source = `sec:${tax}:${tag}`;
    if (/^20-F/.test(latest.form ?? "")) return { skipped: "20-F filer: ordinary shares, not the ADRs that trade here" };
    if (monthsBetween(latest.as_of, today) > STALE_MONTHS) continue;
    if (latest.shares < MIN_SHARES) continue;
    return {
      latest: { ...latest, source },
      // One row per (date, filed), the table's primary key: of two filings
      // made the same day for the same date (an amendment), the later wins.
      history: [
        ...new Map(
          series.filter((s) => s.filed >= SHARES_HISTORY_SINCE).map((s) => [`${s.as_of}|${s.filed}`, { ...s, source }]),
        ).values(),
      ],
    };
  }
  return { skipped: "no current share count in SEC XBRL" };
}

const PRECISION = { 11: "day", 10: "month", 9: "year" };
const RANK_ORDER = { PreferredRank: 0, NormalRank: 1 };

async function fetchInceptions(cik10s) {
  const out = new Map();
  for (let i = 0; i < cik10s.length; i += 150) {
    const batch = cik10s.slice(i, i + 150);
    const values = batch.flatMap((c) => [`"${c}"`, `"${String(Number(c))}"`]).join(" ");
    const query = `SELECT ?cik ?item ?time ?precision ?rank WHERE {
      VALUES ?cik { ${values} }
      ?item wdt:P5531 ?cik .
      ?item p:P571 ?st . ?st psv:P571 ?v . ?st wikibase:rank ?rank .
      ?v wikibase:timeValue ?time ; wikibase:timePrecision ?precision .
      FILTER(?rank != wikibase:DeprecatedRank)
    }`;
    const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/sparql-results+json" } });
    if (!res.ok) throw new Error(`Wikidata HTTP ${res.status}`);
    const json = await res.json();
    for (const b of json.results.bindings) {
      const cik10 = b.cik.value.padStart(10, "0");
      const precision = PRECISION[Number(b.precision.value)];
      if (!precision) continue; // decade or coarser: no usable date
      const time = b.time.value;
      if (time.startsWith("-")) continue;
      const cand = {
        date: time.slice(0, 10),
        precision,
        rank: RANK_ORDER[b.rank.value.split("#")[1]] ?? 1,
        qid: b.item.value.split("/").pop(),
      };
      const fine = { day: 0, month: 1, year: 2 };
      const prev = out.get(cik10);
      const better =
        !prev ||
        cand.rank < prev.rank ||
        (cand.rank === prev.rank && fine[cand.precision] < fine[prev.precision]) ||
        (cand.rank === prev.rank && cand.precision === prev.precision && cand.date < prev.date);
      if (better) out.set(cik10, cand);
    }
    await sleep(1000);
  }
  return out;
}

const q = (v) => (v === null || v === undefined ? "null" : `'${String(v).replace(/'/g, "''")}'`);

function toSql(records) {
  const withData = records.filter((r) => r.cik);
  const lines = ["-- Generated by scripts/fetch-instrument-reference.mjs", "begin;"];
  for (let i = 0; i < withData.length; i += 200) {
    const chunk = withData.slice(i, i + 200);
    lines.push(
      `insert into public.instrument (symbol, asset_class, name) values\n${chunk
        .map((r) => `  (${q(r.symbol)}, 'us_equity', ${q(r.name)})`)
        .join(",\n")}\non conflict (symbol, asset_class) do update set name = coalesce(public.instrument.name, excluded.name);`,
    );
    lines.push(
      `insert into public.instrument_profile (instrument_id, cik, shares_outstanding, shares_outstanding_as_of, shares_outstanding_filed, shares_outstanding_source, inception_date, inception_precision, inception_source, wikidata_qid, reference_fetched_at)
select i.id, v.cik, v.shares::numeric, v.as_of::date, v.filed::date, v.src, v.inception::date, v.precision, v.isrc, v.qid, v.fetched::timestamptz
from (values\n${chunk
        .map((r) => {
          const s = r.shares;
          const inc = r.inception;
          return `  (${q(r.symbol)}, ${q(r.cik)}, ${s ? s.shares : "null"}, ${q(s?.as_of)}, ${q(s?.filed)}, ${q(s?.source)}, ${q(inc?.date)}, ${q(inc?.precision)}, ${inc ? "'wikidata:P571'" : "null"}, ${q(inc?.qid)}, ${q(r.fetchedAt)})`;
        })
        .join(",\n")}\n) as v(symbol, cik, shares, as_of, filed, src, inception, precision, isrc, qid, fetched)
join public.instrument i on i.symbol = v.symbol and i.asset_class = 'us_equity'
on conflict (instrument_id) do update set
  cik = excluded.cik, shares_outstanding = excluded.shares_outstanding,
  shares_outstanding_as_of = excluded.shares_outstanding_as_of, shares_outstanding_filed = excluded.shares_outstanding_filed,
  shares_outstanding_source = excluded.shares_outstanding_source, inception_date = excluded.inception_date,
  inception_precision = excluded.inception_precision, inception_source = excluded.inception_source,
  wikidata_qid = excluded.wikidata_qid, reference_fetched_at = excluded.reference_fetched_at, updated_at = now();`,
    );
  }
  const history = withData.flatMap((r) => (r.history ?? []).map((h) => ({ symbol: r.symbol, ...h })));
  for (let i = 0; i < history.length; i += 1000) {
    const chunk = history.slice(i, i + 1000);
    lines.push(
      `insert into public.instrument_shares_outstanding (instrument_id, as_of, filed, shares, form, accession, source)
select i.id, v.as_of::date, v.filed::date, v.shares::numeric, v.form, v.accn, v.src
from (values\n${chunk
        .map((h) => `  (${q(h.symbol)}, ${q(h.as_of)}, ${q(h.filed)}, ${h.shares}, ${q(h.form)}, ${q(h.accession)}, ${q(h.source)})`)
        .join(",\n")}\n) as v(symbol, as_of, filed, shares, form, accn, src)
join public.instrument i on i.symbol = v.symbol and i.asset_class = 'us_equity'
on conflict (instrument_id, as_of, filed) do update set shares = excluded.shares, form = excluded.form, accession = excluded.accession, source = excluded.source;`,
    );
  }
  lines.push("commit;");
  return lines.join("\n\n") + "\n";
}

// Plain PostgREST calls rather than supabase-js, so this works both with the
// key in SUPABASE_SERVICE_ROLE_KEY and in a Claude Code environment where the
// key is an API credential the sandbox attaches to requests for the Supabase
// host (the script then sends no key of its own).
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://vebhpmmzxixlhujlptue.supabase.co";

async function rest(method, pathAndQuery, body, prefer) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = { "Content-Type": "application/json", Accept: "application/json" };
  if (prefer) headers.Prefer = prefer;
  if (key) {
    headers.apikey = key;
    headers.Authorization = `Bearer ${key}`;
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${pathAndQuery.split("?")[0]}: HTTP ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

const inList = (values) => `(${values.map((v) => `"${String(v).replace(/"/g, '\\"')}"`).join(",")})`;

async function applyToSupabase(records) {
  const withData = records.filter((r) => r.cik);
  for (let i = 0; i < withData.length; i += 200) {
    await rest(
      "POST",
      "instrument?on_conflict=symbol,asset_class",
      withData.slice(i, i + 200).map((r) => ({ symbol: r.symbol, asset_class: "us_equity", name: r.name })),
      "resolution=ignore-duplicates,return=minimal",
    );
  }
  const ids = new Map();
  for (let i = 0; i < withData.length; i += 100) {
    const symbols = withData.slice(i, i + 100).map((r) => r.symbol);
    const rows = await rest(
      "GET",
      `instrument?select=id,symbol&asset_class=eq.us_equity&symbol=in.${encodeURIComponent(inList(symbols))}`,
    );
    for (const row of rows) ids.set(row.symbol, row.id);
  }
  const missing = withData.filter((r) => !ids.has(r.symbol)).map((r) => r.symbol);
  if (missing.length > 0) throw new Error(`no instrument row for ${missing.join(", ")}`);

  const profiles = withData.map((r) => ({
    instrument_id: ids.get(r.symbol),
    cik: r.cik,
    shares_outstanding: r.shares?.shares ?? null,
    shares_outstanding_as_of: r.shares?.as_of ?? null,
    shares_outstanding_filed: r.shares?.filed ?? null,
    shares_outstanding_source: r.shares?.source ?? null,
    inception_date: r.inception?.date ?? null,
    inception_precision: r.inception?.precision ?? null,
    inception_source: r.inception ? "wikidata:P571" : null,
    wikidata_qid: r.inception?.qid ?? null,
    reference_fetched_at: r.fetchedAt,
    updated_at: new Date().toISOString(),
  }));
  for (let i = 0; i < profiles.length; i += 200) {
    await rest("POST", "instrument_profile?on_conflict=instrument_id", profiles.slice(i, i + 200), "resolution=merge-duplicates,return=minimal");
  }

  // One row per primary key, or the batch upsert is refused.
  const history = [
    ...new Map(
      withData.flatMap((r) =>
        (r.history ?? []).map((h) => {
          const row = { instrument_id: ids.get(r.symbol), as_of: h.as_of, filed: h.filed, shares: h.shares, form: h.form, accession: h.accession, source: h.source };
          return [`${row.instrument_id}|${row.as_of}|${row.filed}`, row];
        }),
      ),
    ).values(),
  ];
  for (let i = 0; i < history.length; i += 1000) {
    await rest(
      "POST",
      "instrument_shares_outstanding?on_conflict=instrument_id,as_of,filed",
      history.slice(i, i + 1000),
      "resolution=merge-duplicates,return=minimal",
    );
  }
  return { instruments: ids.size, profiles: profiles.length, historyRows: history.length };
}

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  const fetchedAt = new Date().toISOString();
  const symbols = args.symbols ?? universeFromSource();
  console.log(`${symbols.length} symbols`);

  const tickers = await secGet("https://www.sec.gov/files/company_tickers.json");
  const byTicker = new Map();
  for (const t of Object.values(tickers)) byTicker.set(t.ticker.toUpperCase(), t);

  const records = [];
  for (const symbol of symbols) {
    // SEC writes class suffixes with a dash (BRK-B), some feeds with a dot.
    const entry = byTicker.get(symbol) ?? byTicker.get(symbol.replace(/\./g, "-"));
    if (!entry) {
      records.push({ symbol, cik: null, note: "not in SEC's ticker list (ETF, fund or foreign-only listing)" });
      continue;
    }
    const cik10 = String(entry.cik_str).padStart(10, "0");
    let shares = { skipped: "not fetched" };
    try {
      shares = await fetchShares(cik10, today);
    } catch (err) {
      shares = { skipped: err instanceof Error ? err.message : String(err) };
    }
    records.push({
      symbol,
      cik: cik10,
      name: entry.title,
      shares: shares.latest ?? null,
      history: shares.history ?? [],
      sharesNote: shares.skipped ?? null,
      fetchedAt,
    });
    if (records.length % 50 === 0) console.log(`  ${records.length}/${symbols.length}`);
  }

  const inceptions = await fetchInceptions([...new Set(records.filter((r) => r.cik).map((r) => r.cik))]);
  for (const r of records) if (r.cik) r.inception = inceptions.get(r.cik) ?? null;

  const outPath = path.resolve(root, args.out);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(records, null, 2));
  if (args.sql) {
    const sqlPath = path.resolve(root, args.sql);
    await mkdir(path.dirname(sqlPath), { recursive: true });
    await writeFile(sqlPath, toSql(records));
  }
  const applied = args.apply ? await applyToSupabase(records) : null;

  const withCik = records.filter((r) => r.cik);
  console.log(
    JSON.stringify(
      {
        symbols: records.length,
        matchedToSec: withCik.length,
        withShares: withCik.filter((r) => r.shares).length,
        shareHistoryRows: withCik.reduce((n, r) => n + r.history.length, 0),
        withInception: withCik.filter((r) => r.inception).length,
        inceptionByPrecision: Object.fromEntries(
          ["day", "month", "year"].map((p) => [p, withCik.filter((r) => r.inception?.precision === p).length]),
        ),
        applied,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

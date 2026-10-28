// Research only (wide-range day study, 2026-10-28). Reads split-adjusted daily
// bars for a fixed basket from Alpaca and writes one gzipped CSV. Tries the SIP
// feed (consolidated volume) and falls back to IEX. Never run by the app.
import { writeFileSync, mkdirSync } from "node:fs";
import { gzipSync } from "node:zlib";

const SYMBOLS = (process.env.SYMBOLS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const START = process.env.START ?? "2016-01-01T00:00:00Z";
const headers = {
  "APCA-API-KEY-ID": process.env.ALPACA_API_KEY,
  "APCA-API-SECRET-KEY": process.env.ALPACA_API_SECRET,
};

async function pull(feed) {
  const rows = [];
  for (let i = 0; i < SYMBOLS.length; i += 25) {
    const chunk = SYMBOLS.slice(i, i + 25).join(",");
    let token;
    do {
      const p = new URLSearchParams({ symbols: chunk, timeframe: "1Day", start: START, adjustment: "split", feed, limit: "10000" });
      if (token) p.set("page_token", token);
      const r = await fetch(`https://data.alpaca.markets/v2/stocks/bars?${p}`, { headers });
      if (!r.ok) throw new Error(`${feed} ${r.status} ${await r.text()}`);
      const j = await r.json();
      for (const [sym, bars] of Object.entries(j.bars ?? {}))
        for (const b of bars) rows.push(`${sym},${b.t.slice(0, 10)},${b.o},${b.h},${b.l},${b.c},${b.v}`);
      token = j.next_page_token;
    } while (token);
    console.log(`${feed}: ${Math.min(i + 25, SYMBOLS.length)}/${SYMBOLS.length}, rows ${rows.length}`);
  }
  return rows;
}

let feed = "sip", rows;
try { rows = await pull("sip"); } catch (e) { console.log(String(e)); feed = "iex"; rows = await pull("iex"); }
mkdirSync("research-data", { recursive: true });
writeFileSync("research-data/daily-basket.csv.gz", gzipSync(`symbol,date,o,h,l,c,v\n${rows.join("\n")}\n`));
writeFileSync("research-data/daily-basket.meta.json", JSON.stringify({ feed, start: START, symbols: SYMBOLS.length, rows: rows.length }, null, 1));
console.log(`feed ${feed}, ${rows.length} rows`);

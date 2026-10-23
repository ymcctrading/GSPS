/**
 * Closed crypto bars, kept between scans (scan-speed fix, 2026-10-23).
 *
 * The market scan's crypto pass reads 30 days of hourly bars and 7 days of
 * 15-minute bars for its 12 pairs. Alpaca fills a crypto hourly page from about
 * 11,300 minutes of trades (188 bars), so the hourly read was 46 pages and the
 * 15-minute read 15, every run, all drawn on the background lane's 90 tokens a
 * minute. On 2026-10-23 the pass finished at +72.6 s (12:30 UTC) and +43.0 s
 * (13:00) against its 42 s deadline, so the lists carried no crypto.
 *
 * A closed bar never changes, and crypto bars carry no split adjustment, so
 * each read now takes the stored closed bars and fetches live only from the
 * last two stored bars on (a late print can still revise the newest close).
 * That is about two pages a timeframe. The window asked for is unchanged: the
 * bars returned are the bars a live read of the same window returns.
 *
 * Stored in `closed_bars` (migration 0121, shared by the instances) and in
 * memory. A stored series serves a read only when it was read from at or
 * before the window's start and its last bar is inside the window; otherwise
 * the whole window is read live, as before. A pair the live read returns
 * nothing for is served nothing, as a live read serves it. Each series is read
 * whole again within a day (`wholeReadAfter`, spread by symbol), so a correction Alpaca makes to a
 * bar older than the two rechecked ones is carried for a day at most. A store
 * that can't be read or
 * written falls back to the live read. Crypto only: equity bars are split
 * adjusted, so a stored equity series would need the monthly store's check.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Bar, Timeframe } from "@/lib/types";
import { serviceRoleKey } from "@/lib/supabase/service-key";
import { TF_INTERVAL_MS } from "@/lib/timeframe";
import { fromRows, toRows, type BatchFetch } from "@/lib/data/monthlyStore";

/** The timeframes this store keeps: the crypto pass's hourly and execution charts. */
const KEPT: ReadonlySet<Timeframe> = new Set<Timeframe>(["15Min", "1Hour"]);

/** Stored bars re-read live each time, for late revisions to the newest closes. */
const RECHECK_BARS = 2;

/** How long a stored series serves before it is read whole again. Engineering choice. */
export const WHOLE_READ_MS = 24 * 3_600_000;

/**
 * Each pair's whole read comes due up to this much early, by its symbol, so the
 * pairs read whole together on a cold store spread over the scans of the next
 * day instead of all landing on one (about 46 hourly pages at once).
 */
const WHOLE_READ_SPREAD_MS = 12 * 3_600_000;
const SPREAD_SLOT_MS = 15 * 60_000;

/** How long `symbol`'s stored series serves before it is read whole again. */
export function wholeReadAfter(symbol: string): number {
  let h = 0;
  for (const ch of symbol) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const slots = WHOLE_READ_SPREAD_MS / SPREAD_SLOT_MS;
  return WHOLE_READ_MS - (h % slots) * SPREAD_SLOT_MS;
}

export interface StoredSeries {
  /** The start of the window the series was read from (epoch ms). */
  from: number;
  /** When the whole window was last read live (epoch ms). */
  wholeAt: number;
  /** Closed bars only, oldest first. */
  bars: Bar[];
}

export interface ClosedBarsStore {
  read(timeframe: Timeframe, symbols: string[]): Promise<Map<string, StoredSeries>>;
  write(timeframe: Timeframe, rows: Map<string, StoredSeries>): Promise<void>;
}

type Row = [number, number, number, number, number, number];

function serviceStore(): ClosedBarsStore | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = serviceRoleKey();
  if (!url || !key) return null;
  let client: SupabaseClient;
  try {
    client = createClient(url, key, { auth: { persistSession: false } });
  } catch (err) {
    console.warn(`[closed-bars] store not opened, reading live — ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
  return {
    async read(timeframe, symbols) {
      const { data, error } = await client
        .from("closed_bars")
        .select("symbol, from_ts, whole_at, bars")
        .eq("timeframe", timeframe)
        .in("symbol", symbols);
      if (error) throw new Error(error.message);
      const out = new Map<string, StoredSeries>();
      for (const r of data ?? []) {
        out.set(r.symbol as string, {
          from: Date.parse(r.from_ts as string),
          wholeAt: Date.parse(r.whole_at as string),
          bars: fromRows(r.bars as Row[]),
        });
      }
      return out;
    },
    async write(timeframe, rows) {
      const payload = [...rows].map(([symbol, s]) => ({
        timeframe,
        symbol,
        from_ts: new Date(s.from).toISOString(),
        whole_at: new Date(s.wholeAt).toISOString(),
        bars: toRows(s.bars),
        updated_at: new Date().toISOString(),
      }));
      const { error } = await client.from("closed_bars").upsert(payload, { onConflict: "timeframe,symbol" });
      if (error) throw new Error(error.message);
    },
  };
}

let store: ClosedBarsStore | null | undefined;
function storeFor(): ClosedBarsStore | null {
  if (store === undefined) store = serviceStore();
  return store;
}

/** Held on this instance, by `${timeframe}:${symbol}`. */
let memory = new Map<string, StoredSeries>();

/** Test hook: the store to use (null for none); undefined restores the default. Clears memory. */
export function setClosedBarsStore(s: ClosedBarsStore | null | undefined): void {
  store = s;
  memory = new Map();
}

/** True when `timeframe` is one this store keeps. */
export function keepsClosedBars(timeframe: Timeframe): boolean {
  return KEPT.has(timeframe);
}

/**
 * Crypto bars for `symbols` from `start` to now: the stored closed bars plus a
 * live read from the last two of them. `timeframe` must be one `keepsClosedBars`
 * accepts; any other is read live.
 */
export async function fetchCryptoClosedStored(
  fetchBatch: BatchFetch,
  symbols: string[],
  timeframe: Timeframe,
  start: Date,
  now: Date = new Date(),
): Promise<Map<string, Bar[]>> {
  if (!KEPT.has(timeframe)) return fetchBatch(symbols, timeframe, start, null, "crypto");
  const interval = TF_INTERVAL_MS[timeframe];
  const syms = Array.from(new Set(symbols.map((s) => s.toUpperCase())));
  const startMs = start.getTime();
  const nowMs = now.getTime();
  const key = (s: string) => `${timeframe}:${s}`;
  const shared = storeFor();

  const unknown = syms.filter((s) => !memory.has(key(s)));
  if (shared && unknown.length > 0) {
    try {
      for (const [sym, series] of await shared.read(timeframe, unknown)) memory.set(key(sym), series);
    } catch (err) {
      console.warn(`[closed-bars] ${timeframe} rows not read, reading live — ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // A held series serves the read when it reaches back to the window's start,
  // its newest bar is still inside the window, and it was read whole within a day.
  const held = new Map<string, StoredSeries>();
  for (const s of syms) {
    const series = memory.get(key(s));
    const last = series?.bars.at(-1);
    if (series && last && series.from <= startMs && Date.parse(last.t) >= startMs && nowMs - series.wholeAt < wholeReadAfter(s)) held.set(s, series);
  }
  const cold = syms.filter((s) => !held.has(s));

  // The held symbols are read live from the earliest of their recheck points.
  let liveFrom = Infinity;
  for (const series of held.values()) {
    const recheck = series.bars[Math.max(0, series.bars.length - RECHECK_BARS)];
    liveFrom = Math.min(liveFrom, Date.parse(recheck.t));
  }
  const [recent, whole] = await Promise.all([
    held.size > 0 ? fetchBatch([...held.keys()], timeframe, new Date(liveFrom), null, "crypto") : Promise.resolve(new Map<string, Bar[]>()),
    cold.length > 0 ? fetchBatch(cold, timeframe, start, null, "crypto") : Promise.resolve(new Map<string, Bar[]>()),
  ]);

  const out = new Map<string, Bar[]>();
  const toStore = new Map<string, StoredSeries>();
  const closed = (b: Bar) => Date.parse(b.t) + interval <= nowMs;
  for (const s of syms) {
    let bars: Bar[];
    const series = held.get(s);
    if (series) {
      const live = recent.get(s) ?? [];
      if (live.length === 0) {
        // The live read starts inside the held series, so nothing back means
        // the feed has nothing for the pair: serve what a live read serves.
        bars = [];
        memory.delete(key(s));
      } else {
        const liveStart = Date.parse(live[0].t);
        bars = [...series.bars.filter((b) => Date.parse(b.t) < liveStart), ...live];
      }
    } else {
      bars = whole.get(s) ?? [];
    }
    const windowed = bars.filter((b) => Date.parse(b.t) >= startMs);
    out.set(s, windowed);
    const closedBars = windowed.filter(closed);
    if (closedBars.length > 0) {
      const next = { from: startMs, wholeAt: series?.wholeAt ?? nowMs, bars: closedBars };
      memory.set(key(s), next);
      toStore.set(s, next);
    }
  }

  // Not waited on: the scan reads the bars, not the write.
  if (shared && toStore.size > 0) {
    void shared
      .write(timeframe, toStore)
      .catch((err: unknown) =>
        console.warn(`[closed-bars] ${timeframe} rows not written — ${err instanceof Error ? err.message : String(err)}`),
      );
  }
  return out;
}

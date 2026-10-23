/**
 * Closed monthly bars, kept for the month (scan-speed fix, 2026-10-23).
 *
 * Alpaca answers a bars request in pages it cuts by the history it reads, not
 * by the `limit` asked for: a page of monthly bars held about 450 of them
 * (some 9,600 trading days) on 2026-10-23, so the market scan's monthly read
 * of 250 stocks back to 2016 took 39 pages and 39.7 s every run, and at 10:30
 * UTC landed too late for the coarse pass (the yearly-cycle re-rank and the
 * coarse trend's monthly chart were skipped) while its tokens held the crypto
 * pass past its deadline. A month that has closed never changes, so it is read
 * once a month: the first read of a stock in a New York month stores every
 * closed month (`monthly_bars_closed`, migration 0120, shared by the
 * instances, and in memory), and every later read fetches only the last two
 * months live, about one page for 250 stocks.
 *
 * Split adjustment rewrites history, so each read checks the stored series
 * against the live read of the last closed month: a close that differs by more
 * than 0.1%, or a month one side has and the other doesn't, reads the stock's
 * whole history again and stores that. A split moves that close by its ratio,
 * which is what the check is for (bars are read with `adjustment=split`). It
 * does not catch a later correction to another field or to an older month,
 * and a stock with no bar last month on either side passes unchecked.
 *
 * Months are read in New York time from each bar's stamp: Alpaca stamps a
 * monthly bar at midnight New York time on the 1st (04:00 or 05:00 UTC).
 *
 * Only the live feed is stored. A store that can't be read or written falls
 * back to the live read, as before.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AssetClass, Bar, Timeframe } from "@/lib/types";
import { serviceRoleKey } from "@/lib/supabase/service-key";
import { etDateKey } from "@/lib/market/session";

export type BatchFetch = (
  symbols: string[],
  timeframe: Timeframe,
  start: Date,
  end: Date | null,
  assetClass: AssetClass,
) => Promise<Map<string, Bar[]>>;

/** Alpaca's history starts in 2016: a stored series reaches back to here. */
export const STORE_START = new Date(Date.UTC(2016, 0, 1));

/** A stored close may differ from the live one by this much before the series is read again. */
const CLOSE_TOLERANCE = 0.001;

export interface MonthlyBarsStore {
  /** Each symbol's stored closed months for `month`; absent symbols have none. */
  read(month: string, symbols: string[]): Promise<Map<string, Bar[]>>;
  write(month: string, rows: Map<string, Bar[]>): Promise<void>;
}

/** Stored compactly: [t in epoch seconds, o, h, l, c, v]. */
type Row = [number, number, number, number, number, number];

export function toRows(bars: Bar[]): Row[] {
  return bars.map((b) => [Math.round(Date.parse(b.t) / 1000), b.o, b.h, b.l, b.c, b.v]);
}

export function fromRows(rows: Row[]): Bar[] {
  return rows.map(([t, o, h, l, c, v]) => ({ t: new Date(t * 1000).toISOString().replace(".000Z", "Z"), o, h, l, c, v }));
}

function serviceStore(): MonthlyBarsStore | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = serviceRoleKey();
  if (!url || !key) return null;
  const client: SupabaseClient = createClient(url, key, { auth: { persistSession: false } });
  let prunedFor: string | null = null;
  return {
    async read(month, symbols) {
      const out = new Map<string, Bar[]>();
      for (let i = 0; i < symbols.length; i += 200) {
        const { data, error } = await client
          .from("monthly_bars_closed")
          .select("symbol, bars")
          .eq("month", month)
          .in("symbol", symbols.slice(i, i + 200));
        if (error) throw new Error(error.message);
        for (const r of data ?? []) out.set(r.symbol as string, fromRows(r.bars as Row[]));
      }
      return out;
    },
    async write(month, rows) {
      const payload = [...rows].map(([symbol, bars]) => ({ month, symbol, bars: toRows(bars) }));
      for (let i = 0; i < payload.length; i += 100) {
        const { error } = await client
          .from("monthly_bars_closed")
          .upsert(payload.slice(i, i + 100), { onConflict: "month,symbol" });
        if (error) throw new Error(error.message);
      }
      // Earlier months' rows are never read again.
      if (prunedFor !== month) {
        prunedFor = month;
        const { error } = await client.from("monthly_bars_closed").delete().lt("month", month);
        if (error) console.warn(`[monthly-store] rows before ${month} not deleted — ${error.message}`);
      }
    },
  };
}

let store: MonthlyBarsStore | null | undefined;
function storeFor(): MonthlyBarsStore | null {
  if (store === undefined) store = serviceStore();
  return store;
}

/** In memory, one New York month at a time. */
let memory: { month: string; bars: Map<string, Bar[]> } | null = null;

/** Whole-history reads in flight on this instance, by symbol. */
let rereads: { month: string; bySymbol: Map<string, Promise<Bar[]>> } = { month: "", bySymbol: new Map() };

/** Test hook: the store to use (null for none); undefined restores the default. Clears memory. */
export function setMonthlyBarsStore(s: MonthlyBarsStore | null | undefined): void {
  store = s;
  memory = null;
  rereads = { month: "", bySymbol: new Map() };
}

const monthOf = (t: string) => etDateKey(new Date(t)).slice(0, 7);

/** The first of the month before `month` (YYYY-MM), at UTC midnight: before its bar's timestamp. */
function previousMonthStart(month: string): Date {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 2, 1));
}

/** True when the stored closed months agree with the live read of the months it overlaps. */
export function storedAgrees(stored: Bar[], live: Bar[], month: string): boolean {
  const from = previousMonthStart(month).getTime();
  const liveClosed = live.filter((b) => monthOf(b.t) < month);
  const storedRecent = stored.filter((b) => Date.parse(b.t) >= from);
  if (liveClosed.length !== storedRecent.length) return false;
  return liveClosed.every((b, i) => {
    const s = storedRecent[i];
    if (monthOf(s.t) !== monthOf(b.t)) return false;
    return Math.abs(s.c - b.c) <= CLOSE_TOLERANCE * Math.max(Math.abs(b.c), 1e-9);
  });
}

/**
 * Monthly bars for `symbols` from `start`, stored months plus a live read of
 * the last two. Equities on the live feed only; anything else is read live.
 */
export async function fetchMonthlyStored(
  fetchBatch: BatchFetch,
  symbols: string[],
  start: Date,
  end: Date | null,
  now: Date = new Date(),
): Promise<Map<string, Bar[]>> {
  const month = etDateKey(now).slice(0, 7);
  const syms = Array.from(new Set(symbols.map((s) => s.toUpperCase())));
  if (memory?.month !== month) memory = { month, bars: new Map() };
  const mem = memory.bars;
  const shared = storeFor();

  const unknown = syms.filter((s) => !mem.has(s));
  if (shared && unknown.length > 0) {
    try {
      for (const [sym, bars] of await shared.read(month, unknown)) mem.set(sym, bars);
    } catch (err) {
      console.warn(`[monthly-store] ${month} rows not read, reading live — ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Each held series as it stood before the live read: another call on this
  // instance may replace or drop it while this one waits.
  const heldSeries = new Map(syms.filter((s) => mem.has(s)).map((s) => [s, mem.get(s)!] as const));
  const held = [...heldSeries.keys()];
  const recent = held.length > 0 ? await fetchBatch(held, "1Month", previousMonthStart(month), end, "us_equity") : new Map<string, Bar[]>();

  const out = new Map<string, Bar[]>();
  const fromMs = start.getTime();
  const reread: string[] = syms.filter((s) => !heldSeries.has(s));
  for (const sym of held) {
    const live = recent.get(sym) ?? [];
    const stored = heldSeries.get(sym)!;
    if (!storedAgrees(stored, live, month)) {
      if (mem.get(sym) === stored) mem.delete(sym);
      reread.push(sym);
      continue;
    }
    const current = live.filter((b) => monthOf(b.t) >= month);
    out.set(sym, [...stored, ...current].filter((b) => Date.parse(b.t) >= fromMs));
  }

  if (reread.length > 0) {
    // A whole history already being read on this instance is joined, not read
    // twice (the scan's background monthly read and its full pass overlap).
    const pending = rereads.month === month ? rereads.bySymbol : new Map<string, Promise<Bar[]>>();
    rereads = { month, bySymbol: pending };
    const own = reread.filter((s) => !pending.has(s));
    if (own.length > 0) {
      const full = fetchBatch(own, "1Month", STORE_START.getTime() < fromMs ? STORE_START : start, end, "us_equity");
      for (const sym of own) {
        const one = full.then((m) => m.get(sym) ?? []);
        pending.set(sym, one);
        // Dropped once settled, so a later mismatch reads again.
        void one.then(
          () => pending.get(sym) === one && pending.delete(sym),
          () => pending.get(sym) === one && pending.delete(sym),
        );
      }
      void full
        .then((m) => {
          const toStore = new Map<string, Bar[]>();
          for (const sym of own) {
            // Read from 2016 (or earlier), so whole enough to serve any later window.
            const closed = (m.get(sym) ?? []).filter((b) => monthOf(b.t) < month);
            if (memory?.month === month) memory.bars.set(sym, closed);
            // A stock with no bars is kept in memory only: nothing to share.
            if (closed.length > 0) toStore.set(sym, closed);
          }
          // Not waited on: the scan reads the bars, not the write.
          if (shared && toStore.size > 0) {
            void shared
              .write(month, toStore)
              .catch((err: unknown) =>
                console.warn(`[monthly-store] ${month} rows not written — ${err instanceof Error ? err.message : String(err)}`),
              );
          }
        })
        .catch(() => undefined);
    }
    const bars = await Promise.all(reread.map((s) => pending.get(s)!));
    reread.forEach((sym, i) => out.set(sym, bars[i].filter((b) => Date.parse(b.t) >= fromMs)));
  }
  return out;
}

/**
 * The scan universe's monthly bars, for Gann's relative strength rank (S6,
 * `lib/gann/universeStrength.ts`). One batched request per 100 symbols.
 *
 * Live: read once per ET day per server instance and cached, as the market's
 * own bars are (`marketBenchmark.ts`), and started alongside a scan's other
 * fetches, so a scan waits on it only on an instance's first scan of the day.
 * A failed read returns null and the rank is unread (P3(c) then fails, as an
 * unread check does). Replay: `fetchUniverseStrengthSince` reads the whole
 * span once per run, off any user's path.
 *
 * Shared by month (2026-10-23): the reading in month M uses only the months
 * closed before M, so a read made in M serves all of M. The first instance to
 * read it in a New York month stores it (`universe_strength_months`, migration
 * 0119) and every other instance reads that row: one 832-symbol read a month
 * for the whole platform instead of one per instance per day, which on
 * 2026-10-23 at 00:35 UTC took 33 pages beside the evening scan's own reads
 * and left the scan without rate-limit tokens. A row that can't be read or
 * written falls back to the live read, as before.
 */

import type { Bar } from "@/lib/types";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getMarketDataProvider } from "@/lib/data/provider";
import { inForegroundLane } from "@/lib/data/http";
import { serviceRoleKey } from "@/lib/supabase/service-key";
import { etDateKey } from "@/lib/market/session";
import { LARGE_CAP_UNIVERSE } from "@/lib/scan/large-cap-universe";
import { buildUniverseStrength, MIN_PEERS, STRENGTH_MONTHS, type UniverseStrength } from "@/lib/gann/universeStrength";

/** The rank's peers: the list the market scan rotates through. */
export const STRENGTH_UNIVERSE = LARGE_CAP_UNIVERSE;

async function fetchUniverseMonthly(start: Date): Promise<Map<string, Bar[]>> {
  const provider = getMarketDataProvider();
  const end = provider.isLive ? new Date(Date.now() - 16 * 60 * 1000) : null;
  if (provider.fetchBarsBatch) return provider.fetchBarsBatch(STRENGTH_UNIVERSE, "1Month", start, end, "us_equity");
  // A provider with no batch form (the synthetic demo feed): one read each.
  const out = new Map<string, Bar[]>();
  await Promise.all(
    STRENGTH_UNIVERSE.map(async (s) => {
      const bars = await provider.fetchBars(s, "1Month", start, end, "us_equity").catch(() => []);
      out.set(s.toUpperCase(), bars);
    }),
  );
  return out;
}

/** The first of the month STRENGTH_MONTHS + 2 months before `from`'s month. */
function readingStart(from: Date): Date {
  return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - STRENGTH_MONTHS - 2, 1));
}

/** Every month's universe positions from `from`'s month on, for the replay. */
export async function fetchUniverseStrengthSince(from: Date): Promise<UniverseStrength | null> {
  try {
    return buildUniverseStrength(await fetchUniverseMonthly(readingStart(from)));
  } catch {
    return null;
  }
}

/** A month's stored read: every reading month it built, position by symbol. */
export type StoredReadings = Record<string, Record<string, number>>;

/** Where a month's read is shared between instances; null when there is none. */
export interface UniverseStrengthStore {
  read(month: string): Promise<StoredReadings | null>;
  write(month: string, readings: StoredReadings, symbols: number): Promise<void>;
}

function serviceStore(): UniverseStrengthStore | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = serviceRoleKey();
  if (!url || !key) return null;
  const client: SupabaseClient = createClient(url, key, { auth: { persistSession: false } });
  return {
    async read(month) {
      const { data, error } = await client
        .from("universe_strength_months")
        .select("readings")
        .eq("month", month)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data?.readings as StoredReadings | undefined) ?? null;
    },
    async write(month, readings, symbols) {
      const { error } = await client
        .from("universe_strength_months")
        .upsert({ month, readings, symbols }, { onConflict: "month", ignoreDuplicates: true });
      if (error) throw new Error(error.message);
    },
  };
}

let store: UniverseStrengthStore | null | undefined;
function storeFor(): UniverseStrengthStore | null {
  if (store === undefined) store = serviceStore();
  return store;
}

/** Test hook: the store to use (null for none); undefined restores the default. */
export function setUniverseStrengthStore(s: UniverseStrengthStore | null | undefined): void {
  store = s;
}

export function toStoredReadings(strength: UniverseStrength): StoredReadings {
  const out: StoredReadings = {};
  for (const [month, entry] of strength) out[month] = Object.fromEntries(entry.bySymbol);
  return out;
}

export function fromStoredReadings(readings: StoredReadings): UniverseStrength {
  const out: UniverseStrength = new Map();
  for (const [month, positions] of Object.entries(readings)) {
    const bySymbol = new Map(Object.entries(positions).map(([sym, pos]) => [sym, Number(pos)] as const));
    out.set(month, { sorted: [...bySymbol.values()].sort((a, b) => a - b), bySymbol });
  }
  return out;
}

/**
 * The month's read: the stored one when another instance has made it, else
 * read live and stored, when the month's own reading ranks at least
 * `MIN_PEERS` (a thinner read is used but not kept for the month).
 */
async function readMonth(now: Date): Promise<UniverseStrength | null> {
  const month = etDateKey(now).slice(0, 7);
  const shared = storeFor();
  if (shared) {
    try {
      const stored = await shared.read(month);
      if (stored) return fromStoredReadings(stored);
    } catch (err) {
      console.warn(`[universe-strength] ${month} row not read, reading live — ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  const strength = await fetchUniverseStrengthSince(now);
  const own = strength?.get(month);
  if (shared && strength && own && own.bySymbol.size >= MIN_PEERS) {
    await shared
      .write(month, toStoredReadings(strength), own.bySymbol.size)
      .catch((err: unknown) =>
        console.warn(`[universe-strength] ${month} row not written — ${err instanceof Error ? err.message : String(err)}`),
      );
  }
  return strength;
}

let cached: { day: string; strength: Promise<UniverseStrength | null> } | null = null;

export function getUniverseStrength(now: Date = new Date()): Promise<UniverseStrength | null> {
  const day = etDateKey(now);
  if (cached && cached.day === day) return cached.strength;
  // Shared by every caller, so it is read at full priority even when the
  // first caller runs in the background lane (a scan's fund pass, say).
  const strength = inForegroundLane(() => readMonth(now)).catch(() => null);
  const entry = { day, strength };
  cached = entry;
  // A failed read (a throttled request, say) is not kept for the day: the
  // next scan reads again rather than leaving the rank unread until midnight.
  void strength.then((u) => {
    if (u === null && cached === entry) cached = null;
  });
  return strength;
}

export function resetUniverseStrengthCache(): void {
  cached = null;
}

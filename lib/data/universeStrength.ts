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
 */

import type { Bar } from "@/lib/types";
import { getMarketDataProvider } from "@/lib/data/provider";
import { etDateKey } from "@/lib/market/session";
import { LARGE_CAP_UNIVERSE } from "@/lib/scan/large-cap-universe";
import { buildUniverseStrength, STRENGTH_MONTHS, type UniverseStrength } from "@/lib/gann/universeStrength";

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

let cached: { day: string; strength: Promise<UniverseStrength | null> } | null = null;

export function getUniverseStrength(now: Date = new Date()): Promise<UniverseStrength | null> {
  const day = etDateKey(now);
  if (cached && cached.day === day) return cached.strength;
  const strength = fetchUniverseStrengthSince(now);
  cached = { day, strength };
  return strength;
}

export function resetUniverseStrengthCache(): void {
  cached = null;
}

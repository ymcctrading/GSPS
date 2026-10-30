/**
 * Loads the backtest's point-in-time universe (`lib/universe/pointInTime.ts`)
 * for a run: every candidate's monthly bars and share counts, each year's
 * members, and the strength rank's peers read from those members, so a past
 * month ranks a stock among that month's large caps.
 *
 * One read per run, off any user's path: today's list in batches, and each
 * departed ticker on its own, as of its last day in the index. Share counts
 * come from the stored filings (`loadInstrumentReferenceHistory`, or its
 * checked-in snapshot) for today's list, and from `pointInTimeShares.json`
 * (`scripts/fetch-point-in-time-shares.mjs`) for the departed.
 */

import type { Bar } from "@/lib/types";
import type { SharesPoint } from "@/lib/data/instrumentReference";
import { getMarketDataProvider } from "@/lib/data/provider";
import { buildUniverseStrength, STRENGTH_MONTHS, type UniverseStrength } from "@/lib/gann/universeStrength";
import { LARGE_CAP_UNIVERSE } from "@/lib/scan/large-cap-universe";
import {
  buildPointInTimeUniverse,
  isPointInTimeMember,
  marketCapAt,
  pointInTimeCandidates,
  yearsBetween,
  type Candidate,
  type PointInTimeUniverse,
} from "@/lib/universe/pointInTime";
import pointInTimeShares from "@/lib/universe/pointInTimeShares.json";

interface StoredShares {
  symbols: Record<string, { history?: [string, string, number][] }>;
}

/** The departed tickers' share counts, as fetched from SEC. */
export function departedShares(file: StoredShares = pointInTimeShares as unknown as StoredShares): Map<string, SharesPoint[]> {
  const out = new Map<string, SharesPoint[]>();
  for (const [symbol, row] of Object.entries(file.symbols)) {
    const history = (row.history ?? []).map(([asOf, filed, shares]) => ({ asOf, filed, shares }));
    if (history.length > 0) out.set(symbol.toUpperCase(), history);
  }
  return out;
}

/** The first month a run's reading needs: the strength rank's span, and the close before the first year. */
export function monthlyReadStart(from: string): Date {
  const y = Number(from.slice(0, 4));
  const m = Number(from.slice(5, 7)) - 1;
  return new Date(Math.min(Date.UTC(y, m - STRENGTH_MONTHS - 2, 1), Date.UTC(y - 1, 11, 1)));
}

async function fetchCandidateMonthly(candidates: Candidate[], start: Date): Promise<Map<string, Bar[]>> {
  const provider = getMarketDataProvider();
  const out = new Map<string, Bar[]>();
  const current = candidates.filter((c) => c.asOf === null).map((c) => c.symbol);
  if (provider.fetchBarsBatch) {
    const batch = provider.fetchBarsBatch.bind(provider);
    // In chunks, so a rate-limited page repeats one chunk's reads, not the whole list's.
    for (let i = 0; i < current.length; i += BATCH_CHUNK) {
      const chunk = current.slice(i, i + BATCH_CHUNK);
      const label = `today's list (${i + 1}-${i + chunk.length})`;
      for (const [s, bars] of await fetchWithRetry(() => batch(chunk, "1Month", start, null, "us_equity"), label)) out.set(s.toUpperCase(), bars);
    }
  }
  for (const c of candidates) {
    if (out.has(c.symbol)) continue;
    out.set(c.symbol, await fetchWithRetry(() => provider.fetchBars(c.symbol, "1Month", start, null, "us_equity", undefined, false, c.asOf ?? undefined), c.symbol));
  }
  return out;
}

/** Symbols a batch read takes at once. */
const BATCH_CHUNK = 100;
/**
 * Waits between attempts, about four minutes in all: the vendor's 200 requests
 * a minute are shared with every other run on the key, so a rate limit can
 * outlast a short backoff (seen 2026-10-30, a run stopped after 30 s of 429s).
 */
const RETRY_WAITS_MS = [5_000, 15_000, 30_000, 60_000, 60_000, 60_000];

/**
 * A failed read is retried, then stops the run: read as no bars it would leave
 * the ticker out in one job of a split run and not another, shifting every
 * slice after it (review of this change).
 */
async function fetchWithRetry<T>(read: () => Promise<T>, symbol: string): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < RETRY_WAITS_MS.length + 1; attempt++) {
    try {
      return await read();
    } catch (err) {
      last = err;
      if (attempt === RETRY_WAITS_MS.length) break;
      await new Promise((r) => setTimeout(r, RETRY_WAITS_MS[attempt]));
    }
  }
  throw new Error(`Point-in-time universe: monthly bars for ${symbol} failed: ${last instanceof Error ? last.message : String(last)}`);
}

/**
 * Departed tickers whose bars stop more than two months before the day read as
 * of, or start after it and after the feed's own first month (the free feed
 * starts in mid-2020, so a ticker that left before then has no earlier bars
 * either, which says nothing about the mapping). Logging only.
 */
export function suspectDepartedBars(candidates: readonly Candidate[], monthly: ReadonlyMap<string, readonly Bar[]>): string[] {
  let feedStartMs = Infinity;
  for (const c of candidates) {
    const first = c.asOf === null ? monthly.get(c.symbol)?.[0] : undefined;
    if (first) feedStartMs = Math.min(feedStartMs, Date.parse(first.t));
  }
  if (!Number.isFinite(feedStartMs)) feedStartMs = -Infinity;
  return candidates
    .filter((c) => c.asOf !== null)
    .filter((c) => {
      const bars = monthly.get(c.symbol) ?? [];
      if (bars.length === 0) return false;
      const asOfMs = Date.parse(`${c.asOf}T00:00:00Z`);
      const startsLate = Date.parse(bars[0].t) > Math.max(asOfMs, feedStartMs);
      return startsLate || Date.parse(bars[bars.length - 1].t) < asOfMs - 62 * 86_400_000;
    })
    .map((c) => c.symbol);
}

/** A short fingerprint of the member list, so the jobs of a split run can be checked to have read the same one. */
export function memberListHash(symbols: readonly string[]): string {
  let h = 2166136261;
  for (const ch of symbols.join(",")) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export interface LoadedPointInTime {
  universe: PointInTimeUniverse;
  strength: UniverseStrength;
  /** Every candidate's share counts, today's and the departed's. */
  shares: Map<string, SharesPoint[]>;
  /** The symbols to replay: members in at least one year, in candidate order. */
  symbols: string[];
  /** A departed ticker's as-of date, for its bars. */
  asOf: Map<string, string>;
  /** `memberListHash` of `symbols`. */
  hash: string;
  /** Departed tickers with a stored share count. */
  departedWithShares: number;
  /**
   * Departed tickers whose bars stop more than 31 days before the day read as
   * of, or start after it (and after the feed's first month): `asof` may not
   * have mapped them to their company.
   */
  suspectBars: string[];
  /**
   * Today's-list names whose cap read now (latest count × latest close) is
   * under half the floor: most likely a split after the last filing, which
   * the count can't see and the split-adjusted bars already carry, so every
   * year reads small. Logged, not corrected.
   */
  suspectSplits: string[];
}

/**
 * The universe for a run starting on `from` (YYYY-MM-DD) and ending `to`.
 * `todayShares` is the stored filings history for today's list.
 */
export async function loadPointInTimeUniverse(input: {
  from: string;
  to: string;
  todayShares: ReadonlyMap<string, SharesPoint[]>;
  today?: readonly string[];
}): Promise<LoadedPointInTime> {
  const candidates = pointInTimeCandidates(input.today ?? LARGE_CAP_UNIVERSE, input.from);
  const monthly = await fetchCandidateMonthly(candidates, monthlyReadStart(input.from));
  const shares = new Map<string, SharesPoint[]>(input.todayShares);
  const departed = departedShares();
  for (const [s, h] of departed) if (!shares.has(s)) shares.set(s, h);
  const suspectBars = suspectDepartedBars(candidates, monthly);
  const universe = buildPointInTimeUniverse({ candidates, years: yearsBetween(input.from, input.to), monthly, shares });
  const peers = new Map([...monthly].filter(([s]) => universe.members.has(s)));
  const strength = buildUniverseStrength(peers, (s, month) => isPointInTimeMember(universe, s, `${month}-01`));
  const asOf = new Map(candidates.filter((c) => c.asOf !== null).map((c) => [c.symbol, c.asOf as string]));
  const symbols = candidates.map((c) => c.symbol).filter((s) => universe.members.has(s));
  const nextMonth = new Date(Date.UTC(Number(input.to.slice(0, 4)), Number(input.to.slice(5, 7)), 1)).toISOString().slice(0, 10);
  const suspectSplits = candidates
    .filter((c) => c.source === "today")
    .filter((c) => {
      const now = marketCapAt(shares.get(c.symbol), monthly.get(c.symbol) ?? [], nextMonth);
      return now.capUsd !== null && now.capUsd < universe.floorUsd / 2;
    })
    .map((c) => c.symbol);
  return {
    universe,
    strength,
    shares,
    symbols,
    asOf,
    hash: memberListHash(symbols),
    departedWithShares: candidates.filter((c) => c.source === "history" && departed.has(c.symbol)).length,
    suspectBars,
    suspectSplits,
  };
}

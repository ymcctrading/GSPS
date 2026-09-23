/**
 * Universe rotation — a returning cycle, not a linear batch queue.
 *
 * Design basis (AGENTS.md's "Cycles as architecture, not only scoring" and
 * the Hermetic-principles section it extends — answered explicitly, the
 * same discipline `lib/gann/entryTrigger.ts` uses for a scored criterion):
 *
 * 1. Gann source: none, and none is claimed. This module schedules
 *    infrastructure, not a market technique — there is nothing here to cite
 *    a Gann primary or secondary source for, and pretending otherwise would
 *    be exactly the "dressed up as sourced" failure AGENTS.md warns against.
 * 2. Cycle-theory checklist (Dewey, Part C): one item applies, on the
 *    engineering property of the mechanism rather than on market data —
 *    "phase-resumption after distortion." `resolveRotationChunk` is
 *    time-anchored (derived fresh from ET wall-clock minutes every call)
 *    rather than counter-anchored (incremented and persisted between
 *    calls), specifically so a missed, delayed, or duplicated cron tick
 *    resolves to the *correct* chunk on its next call instead of drifting
 *    out of phase. This is a citable engineering criterion borrowed as a
 *    design heuristic, not a claim that the rotation cadence itself is a
 *    validated market cycle.
 * 3. Hermetic principle: Rhythm. "The pendulum swing manifests in
 *    everything... a rising and a falling... a coming and a going." A
 *    finite batch job that drains a queue and halts is linear; the market
 *    this platform scans never stops cycling, so its own scan of that
 *    market shouldn't complete once and rest either. `resolveRotationChunk`
 *    never returns "done" — it always returns *this* cycle's next chunk,
 *    wrapping back to chunk 0 after the last one. Completing a pass over
 *    the universe is a rebirth into the next pass, not a terminal state.
 *
 * The honest boundary (stated the same way `lib/gann/trendStrength.ts`
 * labels its own engineering constants): the *shape* — a returning wheel
 * instead of a linear drain-and-halt — is what the framing above actually
 * earns. The *numbers* below (chunk size, rotation interval) are ordinary
 * engineering choices sized against the Vercel Hobby 60-second function
 * budget and `FULL_UNIVERSE_TOP`'s measured per-symbol scan cost
 * (lib/marketScan.ts) — not derived from any source, and not final until
 * confirmed against a live timed run the same way `FULL_UNIVERSE_TOP`
 * itself was. Treat `DISCOVERY_CHUNK_SIZE` as provisional until that
 * measurement exists.
 *
 * What this solves: `FULL_UNIVERSE_TOP` bounds every scan to the top 250
 * *same-day most-active* symbols (`resolveUniverse` in lib/marketScan.ts) --
 * a stock outside today's volume leaders is structurally never scanned by
 * the automated pipeline, however good its setup, because the curated
 * large-cap universe (`LARGE_CAP_UNIVERSE`, ~766 symbols) only ever backs
 * fills the pool when the actives screener comes up short. Chunking that
 * full universe and rotating one chunk into the scan per cron tick (instead
 * of only ever scanning the same actives-biased 250) means every symbol
 * gets looked at over the course of a rotation cycle, not never.
 *
 * Two passes, one invocation, no schema change. Wired into
 * `app/api/market-scan/route.ts` as `extraSymbols` on `runMarketScan`
 * (`lib/marketScan.ts`), which `resolveUniverse` places ahead of the actives
 * screener so neither is ever crowded out by it:
 *
 *   - **Tracking pass** (`resolveTrackedSymbols`): today's already-published
 *     `daily_scans` symbols -- the current Watch/Execute shortlist -- are
 *     re-included in *every* run's candidate pool regardless of which
 *     discovery chunk is active, so a qualified setup keeps getting rescored
 *     and re-ranked every 15 minutes instead of only when its chunk comes
 *     back around. This is what actually drives Watch -> Execute detection
 *     (`lib/entitlements/scan-fanout.ts#evaluateMonitorsAndNotify`, already
 *     wired downstream of every `runMarketScan` call) staying continuous.
 *   - **Discovery pass** (`resolveRotationChunk`): the current turn of the
 *     wheel over the full curated universe, so a symbol nobody has already
 *     qualified still gets looked at on its turn.
 *
 * Both feed the *same* existing coarse -> shortlist -> full-scan -> rank
 * pipeline `runMarketScan` already runs, and `persistDailyScans`
 * (lib/scan/publish.ts) already upserts ranks 1..n and prunes anything that
 * drops out on this run -- unchanged, because from that function's point of
 * view this is still just "whatever got scanned and ranked this run," the
 * same as it always received. No new table, no new persistence semantics.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { etParts } from "@/lib/market/session";

/**
 * Cron cadence the rotation is keyed to -- matches
 * `.github/workflows/full-market-scan.yml`'s every-15-minute schedule.
 * Provisional like everything else numeric here: if that cadence changes,
 * this must change with it or the phase math below silently desyncs from
 * reality.
 */
export const ROTATION_INTERVAL_MINUTES = 15;

/**
 * Symbols scanned per discovery chunk. Provisional -- but not, as an earlier
 * draft of this module framed it, "some margin held back under
 * `FULL_UNIVERSE_TOP`." That framing assumed rotation ran *alongside* the
 * top-250-most-active scan, leaving headroom under its number. It doesn't --
 * rotation replaces that approach, so `FULL_UNIVERSE_TOP` is not this
 * constant's reference point at all.
 *
 * What actually bounds this: `fetchBarsBatch`'s chunk mechanics
 * (`lib/data/alpaca.ts` -- 100-symbol request chunks, `CHUNK_CONCURRENCY=3`,
 * so up to ~300 symbols fetch in one serialized wave before a second wave
 * adds real wall-clock time) and the measured cost of one such wave --
 * `FULL_UNIVERSE_TOP`'s own doc comment (lib/marketScan.ts) records a
 * 250-symbol coarse batch fetch at 23.1s on a live run. This chunk also has
 * to share the same 60-second invocation with the tracking pass, which that
 * 23.1s figure did not. Still needs its own live-timed run (the same
 * `mark()`-breadcrumb discipline that number came from) before it is
 * trusted rather than merely plausible -- not deferred as a matter of
 * caution, but because the last two times a number here was set from
 * architectural reasoning alone (`FULL_UNIVERSE_TOP` at 700, then again
 * before that at 100) it was wrong both times.
 */
export const DISCOVERY_CHUNK_SIZE = 150;

/** Splits `universe` into fixed-size chunks, preserving order. The last chunk may be smaller. */
export function chunkUniverse(universe: readonly string[], chunkSize: number): string[][] {
  if (chunkSize <= 0) throw new Error(`chunkUniverse: chunkSize must be positive, got ${chunkSize}`);
  const chunks: string[][] = [];
  for (let i = 0; i < universe.length; i += chunkSize) {
    chunks.push(universe.slice(i, i + chunkSize));
  }
  return chunks;
}

export interface RotationChunk {
  /** Which chunk this call resolved to, 0-indexed. */
  chunkIndex: number;
  /** How many chunks make up one full cycle over `universe`. */
  chunkCount: number;
  /** The symbols belonging to this call's chunk. */
  symbols: string[];
}

/**
 * Resolves which chunk of `universe` "now" belongs to -- a wheel, not a
 * queue. Recomputed fresh from wall-clock time on every call (no state to
 * persist, none to desync): the chunk index is
 * `floor(minutesSinceMidnightET / ROTATION_INTERVAL_MINUTES) % chunkCount`,
 * so a run that fires late, twice, or not at all still resolves the correct
 * chunk for *its own* clock time rather than drifting from a missed
 * increment. A cycle that finishes its last chunk resolves straight back to
 * chunk 0 on the next interval -- there is no "done" state, only the next
 * turn of the wheel.
 *
 * Returns `null` only when `universe` is empty (nothing to chunk).
 */
export function resolveRotationChunk(
  universe: readonly string[],
  chunkSize: number = DISCOVERY_CHUNK_SIZE,
  now: Date = new Date(),
): RotationChunk | null {
  if (universe.length === 0) return null;
  const chunks = chunkUniverse(universe, chunkSize);
  const chunkCount = chunks.length;
  const { minutes } = etParts(now);
  const tick = Math.floor(minutes / ROTATION_INTERVAL_MINUTES);
  const chunkIndex = ((tick % chunkCount) + chunkCount) % chunkCount;
  return { chunkIndex, chunkCount, symbols: chunks[chunkIndex] };
}

/**
 * Today's already-published `daily_scans` symbols -- the tracking pass's
 * input. Deliberately reads the table itself rather than re-deriving "what
 * qualifies" from some other rule: `daily_scans` already *is* the answer to
 * "what does the dashboard currently show," upserted by
 * `lib/scan/publish.ts#persistDailyScans` on every prior run, so this is the
 * single source of truth rather than a second opinion that could disagree
 * with it.
 *
 * Read failures return an empty list rather than throwing -- a tracking-pass
 * read failing should degrade to "this run relies on discovery and the
 * actives screener alone," not abort the scan that would otherwise refresh
 * the dashboard.
 */
export async function resolveTrackedSymbols(
  client: SupabaseClient,
  scanDate: string,
): Promise<string[]> {
  const { data, error } = await client.from("daily_scans").select("symbol").eq("scan_date", scanDate);
  if (error || !data) {
    console.warn(`resolveTrackedSymbols: ${scanDate} not read -- ${error?.message ?? "no data"}`);
    return [];
  }
  return Array.from(new Set((data as { symbol: string }[]).map((r) => r.symbol.toUpperCase())));
}

/**
 * The tracking pass and the discovery pass, combined into the one
 * `extraSymbols` list `runMarketScan` needs -- tracked symbols first, so
 * `resolveUniverse`'s cap can never crowd them out, then this tick's
 * rotation chunk. See this module's own header for why these two, and only
 * these two, make up that list.
 */
export async function resolveDiscoveryAndTrackingSymbols(
  client: SupabaseClient,
  scanDate: string,
  fullUniverse: readonly string[],
  chunkSize: number = DISCOVERY_CHUNK_SIZE,
  now: Date = new Date(),
): Promise<string[]> {
  const tracked = await resolveTrackedSymbols(client, scanDate);
  const chunk = resolveRotationChunk(fullUniverse, chunkSize, now)?.symbols ?? [];
  return Array.from(new Set([...tracked, ...chunk]));
}

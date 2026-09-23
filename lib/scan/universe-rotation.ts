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
 * Not yet wired into `runMarketScan` / the cron route -- that wiring needs
 * a live-timed run to confirm the chunk size leaves real headroom once a
 * tracking pass (re-scanning the already-qualified Watch/Execute shortlist
 * every tick, regardless of which discovery chunk is active) runs in the
 * same 60-second budget. See this module's own exports for what is ready
 * to wire in once that measurement exists.
 */

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
 * Symbols scanned per discovery chunk. Provisional -- sized well under
 * `FULL_UNIVERSE_TOP` (250, itself the measured "one coarse-fetch wave"
 * ceiling) specifically to leave headroom for the tracking pass this same
 * invocation also needs to run. Needs live-timed confirmation, the same
 * discipline `FULL_UNIVERSE_TOP` itself went through, before this number is
 * trusted rather than merely plausible.
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

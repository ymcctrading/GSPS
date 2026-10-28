/**
 * GSPS — the overnight sweep: every stock in the scan universe fully scored once
 * a night, so the next day's market scan can't miss an Execute.
 *
 * Why it exists (owner, 2026-10-22: "executable setups are what we want to
 * push FIRST"). DE read 7 of 9, Execute, on its own page and never reached the
 * Dashboard: the market scan scores in full only the 45-125 stocks a day that
 * pass its cheap coarse pre-filter, and that filter had read DE's trend as
 * sideways and its price clear of a level every day since Oct 15
 * (`coarse_gate_telemetry`), so DE was never scored. The coarse filter is a
 * budget device, not one of Gann's rules: Gann chose his active stocks from
 * the daily charts the night before (AGENTS.md, "WD Gann precedence", the
 * evening focus list; he ranks the groups and then the stocks in them, *Truth
 * of the Stock Tape* Ch. XVI-XVII), which needs every chart looked at, not a
 * pre-filtered few. So the whole universe is scored after the close,
 * off every person's path, and its Execute and Watch setups take the next
 * day's full-scan slots ahead of the coarse guesses.
 *
 * Three-question mandate (AGENTS.md):
 * 1. Gann: the selection from every chart (above). The score itself is
 *    `scanTicker`, unchanged: the same nine pillars a manual scan reads.
 * 2. Cycles: a nightly wheel, not a drain-and-halt. Each call takes the next
 *    stocks not yet scored for tonight's basis day, read from the table rather
 *    than a stored counter, so a missed or failed call is picked up by the
 *    next (Dewey's phase-resumption, as an engineering property only).
 * 3. Hermetic: Correspondence. The verdict a person gets scanning one stock
 *    is the verdict the market scan works from; a stock is not judged twice
 *    by two different tests.
 * Law of Creation: the coarse filter ⊗ the full score was a mixture (the
 * filter only subtracted). The sweep ⊗ the daytime scan creates a third: a
 * list that has seen every chart and is priced on today's quote.
 *
 * Engineering choices, labelled: `SWEEP_SLOTS` (how many of tonight's best the
 * daytime scan re-scores, taken from its existing shortlist so the scan does
 * no more work than before), and the order in which they are taken (Execute,
 * then score). Gann ranks no pillar above another and gives no count.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { etDateKey } from "@/lib/market/session";
import { LARGE_CAP_UNIVERSE } from "@/lib/scan/large-cap-universe";

export interface SweepRow {
  basis_date: string;
  symbol: string;
  direction: string | null;
  score: number | null;
  output_state: string | null;
}

/**
 * Full-scan slots the daytime market scan gives tonight's swept setups, out of
 * its shortlist (`perSide × SHORTLIST_MULTIPLE`, 60 by default). The coarse
 * guesses fill the rest.
 */
export const SWEEP_SLOTS = 30;

/** Symbols scored per bar fetch inside one sweep call. */
export const SWEEP_BATCH = 10;

const TIER: Record<string, number> = { Execute: 2, Watch: 1 };

/**
 * The next symbols to score tonight: the universe's, in its own order, that
 * have no row for this basis day yet. Read from the stored rows each call, so
 * a missed call is never a lost chunk.
 */
export function nextUnswept(universe: readonly string[], swept: ReadonlySet<string>, limit: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of universe) {
    const sym = s.toUpperCase();
    if (seen.has(sym) || swept.has(sym)) continue;
    seen.add(sym);
    out.push(sym);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * The swept setups the daytime scan re-scores first: Execute before Watch,
 * the higher score first, a directional verdict only. At most `slots`.
 */
export function sweptCandidates(rows: readonly SweepRow[], slots: number = SWEEP_SLOTS): string[] {
  return rows
    .filter((r) => (r.output_state === "Execute" || r.output_state === "Watch") && (r.direction === "bullish" || r.direction === "bearish"))
    .map((r, i) => ({ r, i }))
    .sort(
      (a, b) =>
        (TIER[b.r.output_state ?? ""] ?? 0) - (TIER[a.r.output_state ?? ""] ?? 0) ||
        (b.r.score ?? 0) - (a.r.score ?? 0) ||
        a.i - b.i,
    )
    .slice(0, Math.max(0, slots))
    .map((x) => x.r.symbol.toUpperCase());
}

/**
 * The shortlist the full pass scores: the swept setups first, then the coarse
 * shortlist's own order, without repeats, at most `size`. With no swept
 * setups it is the coarse shortlist unchanged.
 */
export function mergeSweptIntoShortlist<C extends { symbol: string }>(
  swept: readonly string[],
  coarse: readonly C[],
  size: number,
  toCandidate: (symbol: string) => C,
): C[] {
  const out: C[] = [];
  const seen = new Set<string>();
  for (const s of swept) {
    const sym = s.toUpperCase();
    if (seen.has(sym) || out.length >= size) continue;
    seen.add(sym);
    out.push(coarse.find((c) => c.symbol.toUpperCase() === sym) ?? toCandidate(sym));
  }
  for (const c of coarse) {
    if (out.length >= size) break;
    const sym = c.symbol.toUpperCase();
    if (seen.has(sym)) continue;
    seen.add(sym);
    out.push(c);
  }
  return out;
}

/**
 * The latest usable night's swept setups, best first (`sweptCandidates`). Best
 * effort: a read failure returns none, and the market scan runs on the coarse
 * shortlist alone, as it did before the sweep.
 */
export async function loadSweptCandidates(
  service: SupabaseClient,
  slots: number = SWEEP_SLOTS,
  now: Date = new Date(),
): Promise<string[]> {
  return (await loadSweptCandidatesWithBasis(service, slots, now)).symbols;
}

/** `loadSweptCandidates`, with the night it read, so a caller resolves it once. */
export async function loadSweptCandidatesWithBasis(
  service: SupabaseClient,
  slots: number = SWEEP_SLOTS,
  now: Date = new Date(),
): Promise<{ symbols: string[]; basis: string | null }> {
  let basis: string | null = null;
  const none = () => ({ symbols: [] as string[], basis });
  try {
    basis = await chooseSweepBasis(service, now);
    if (!basis) return none();
    const { data, error } = await service
      .from("universe_sweep")
      .select("basis_date, symbol, direction, score, output_state")
      .eq("basis_date", basis)
      .in("output_state", ["Execute", "Watch"])
      // A row the session or a later scan already retired (migration 0128)
      // is not re-scored first: the coarse pass or the next night reads its
      // new structure.
      .is("invalidated_at", null);
    if (error || !data) return none();
    return {
      symbols: sweptCandidates(
        (data as SweepRow[]).map((r) => ({ ...r, score: r.score === null ? null : Number(r.score) })),
        slots,
      ),
      basis,
    };
  } catch {
    return none();
  }
}

/** A night older than this is not read: a stopped sweep must not steer the scan for long. */
export const SWEEP_MAX_AGE_DAYS = 4;
/** Share of the universe a night must have scored to be preferred over the one before. */
export const SWEEP_MIN_COVERAGE = 0.5;

/**
 * Which stored night to read, from each recent night's count of scored stocks
 * (failed reads not counted): the
 * newest that scored at least `SWEEP_MIN_COVERAGE` of the universe, else the
 * newest at all. Nights older than `SWEEP_MAX_AGE_DAYS` before `today` (a New
 * York date) are never read.
 */
export function pickSweepBasis(
  counts: readonly { basis_date: string; count: number }[],
  universeSize: number,
  today: string,
): string | null {
  const floor = new Date(`${today}T12:00:00Z`).getTime() - SWEEP_MAX_AGE_DAYS * 86_400_000;
  const recent = counts
    .filter((c) => new Date(`${c.basis_date}T12:00:00Z`).getTime() >= floor)
    .sort((a, b) => (a.basis_date < b.basis_date ? 1 : -1));
  if (recent.length === 0) return null;
  return (recent.find((c) => c.count >= universeSize * SWEEP_MIN_COVERAGE) ?? recent[0]).basis_date;
}

export async function chooseSweepBasis(
  service: SupabaseClient,
  now: Date,
): Promise<string | null> {
  const today = etDateKey(now);
  const counts: { basis_date: string; count: number }[] = [];
  for (let back = 0; back <= SWEEP_MAX_AGE_DAYS; back++) {
    const day = etDateKey(new Date(now.getTime() - back * 86_400_000));
    const { count, error } = await service
      .from("universe_sweep")
      .select("symbol", { count: "exact", head: true })
      .eq("basis_date", day)
      .is("error", null);
    if (error) return null;
    if (count) counts.push({ basis_date: day, count });
    if (count && count >= LARGE_CAP_UNIVERSE.length * SWEEP_MIN_COVERAGE) break;
  }
  return pickSweepBasis(counts, LARGE_CAP_UNIVERSE.length, today);
}

/** A day scan's reading of a symbol, as the sweep's retirement test reads it. */
export interface Reread {
  symbol: string;
  /** The scan failed for the symbol (a feed gap): it read nothing. */
  error: boolean;
  direction: string | null;
  outputState: string | null;
  /** The result carried a full trade plan (`hasTradePlan`). */
  planned: boolean;
}

/**
 * The night's rows a later read of the same chart no longer bears out: the
 * day's market scan re-scored the symbol and found no Execute or Watch plan
 * on the row's side. In Gann's method a new reading of the swing structure
 * replaces the old plan (NSTD Rule 6; AGENTS.md, F3.7). A failed read
 * overrules nothing. Pure.
 */
export function overruledSweepSymbols(
  rows: readonly { symbol: string; direction: string | null }[],
  rereads: readonly Reread[],
): string[] {
  // A symbol can be read twice (the reversion and the continuation pass):
  // the plan stands if either read bears it out.
  const read = new Map<string, Reread[]>();
  for (const r of rereads) {
    if (r.error) continue;
    const key = r.symbol.toUpperCase();
    read.set(key, [...(read.get(key) ?? []), r]);
  }
  return rows
    .filter((row) => {
      const reads = read.get(row.symbol.toUpperCase());
      if (!reads) return false;
      return !reads.some(
        (r) => r.planned && r.direction === row.direction && (r.outputState === "Execute" || r.outputState === "Watch"),
      );
    })
    .map((row) => row.symbol);
}

/**
 * Marks the night's rows the day's market scan overruled (`overruledSweepSymbols`),
 * so the intraday scan stops timing a plan the lists' scan no longer reads
 * (SUS-21). The caller passes the night it read (`loadSweptCandidatesWithBasis`)
 * and calls this only on a scan priced in the regular session: a pre- or
 * post-market quote never retires a plan (`barsSincePlan`'s rule). One read
 * and at most one write. Best-effort: a failure leaves the rows on, as before.
 */
export async function retireOverruledSweepRows(
  service: SupabaseClient,
  basis: string | null,
  rereads: readonly Reread[],
  now: Date = new Date(),
): Promise<number> {
  if (!basis || rereads.length === 0) return 0;
  const { data, error } = await service
    .from("universe_sweep")
    .select("symbol, direction")
    .eq("basis_date", basis)
    .in("symbol", rereads.map((r) => r.symbol.toUpperCase()))
    .in("output_state", ["Execute", "Watch"])
    .is("invalidated_at", null);
  if (error || !data) return 0;
  const overruled = overruledSweepSymbols(data as { symbol: string; direction: string | null }[], rereads);
  if (overruled.length === 0) return 0;
  const { error: writeError } = await service
    .from("universe_sweep")
    .update({ invalidated_at: now.toISOString(), invalidated_reason: "the day's scan no longer reads the plan" })
    .eq("basis_date", basis)
    .in("symbol", overruled)
    .is("invalidated_at", null);
  if (writeError) {
    console.error("[market-scan] sweep retirement not written:", writeError.message);
    return 0;
  }
  return overruled.length;
}

/**
 * GSPS — the evening sweep: every stock in the scan universe fully scored once
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
 * The latest night's swept setups, best first (`sweptCandidates`). Best
 * effort: a read failure returns none, and the market scan runs on the coarse
 * shortlist alone, as it did before the sweep.
 */
export async function loadSweptCandidates(
  service: import("@supabase/supabase-js").SupabaseClient,
  slots: number = SWEEP_SLOTS,
): Promise<string[]> {
  try {
    const { data: latest, error: latestError } = await service
      .from("universe_sweep")
      .select("basis_date")
      .order("basis_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestError || !latest) return [];
    const { data, error } = await service
      .from("universe_sweep")
      .select("basis_date, symbol, direction, score, output_state")
      .eq("basis_date", (latest as { basis_date: string }).basis_date)
      .in("output_state", ["Execute", "Watch"]);
    if (error || !data) return [];
    return sweptCandidates(
      (data as SweepRow[]).map((r) => ({ ...r, score: r.score === null ? null : Number(r.score) })),
      slots,
    );
  } catch {
    return [];
  }
}

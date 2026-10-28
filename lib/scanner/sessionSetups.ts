/**
 * GSPS — the session's setups for the intraday scan: the daily setups ready to
 * be taken today, chosen from the whole scan universe, so the intraday scan
 * times them (owner, 2026-10-28: the 15-minute scans "should really be feeding
 * that data to the intraday scanner"; then "takes all 800+ equities ... takes
 * the highest scoring opportunities or the most executable opportunities, and
 * then tracks those throughout the day").
 *
 * Two reads of the daily charts feed it:
 * - the overnight sweep (`universe_sweep`, `lib/scan/universeSweep.ts`), which
 *   scores every stock in the universe after the close, the night before;
 * - the latest daily lists (`daily_scans`), which the 15-minute market scan
 *   rewrites through the session, so a setup that becomes ready at 11 AM joins
 *   the list and one whose stop breaks or that expires leaves it.
 *
 * Order (Gann ranks none of his conditions above another, so the order is by
 * readiness, then the score, which counts them):
 *   0. on the latest lists, Execute and within a day's range of its entry;
 *   1. Execute in the overnight sweep, where the lists have not since read it
 *      otherwise;
 *   2. on the latest lists, a Watch at the Execute cutoff within a day's range
 *      of its entry: held from Execute today, so the session may make it one.
 * Within a tier, the higher score first, then the symbol (deterministic).
 *
 * Left out: a resting order (more than a day's range from its entry,
 * `lib/setups/resting.ts`: it waits for the reaction, there is nothing to time
 * today), a plan the lists retired for a broken stop, one marked expired
 * (`detail.planExpired`, the "Expire outdated setups" work), and any symbol
 * whose latest list row is a Reject. The sweep's rows carry no price or day's
 * range, so the resting test reads only the lists; since 2026-10-27 the score
 * itself holds a resting plan at Watch (`applyReadyNowHold`), so a sweep
 * Execute is one placeable that day. Known gap, labelled: a sweep Execute the
 * lists never publish (the market scan re-scores the sweep's best first, but
 * publishes only its lists) stays on until the next night's sweep, even if its
 * stop breaks in the session; its intraday alerts still read the session's own
 * bars, and with no stored plan it gets no "level held" timing.
 *
 * Mandate: 1. Gann chose his active stocks from the daily charts after the
 * close ("the best way to read the tape is to stay away from it", *Truth of
 * the Stock Tape* Ch. XIV) and timed the entry on the hourly chart in active
 * markets (Master Course Ch. 13); his orders rested at the level set the night
 * before. 2. No periodicity claim; Dewey's checklist does not apply.
 * 3. Cause and Effect: the daily reading is the cause, the session's timing its
 * effect. Rhythm: the list is rebuilt each night and changed through the day
 * as setups arm, break and expire, a wheel, not a batch. Law of Creation:
 * daily selection ⊗ intraday timing; neither alone says "this stock, now".
 * `SESSION_SETUPS_MAX` is an engineering figure sized to the free feed.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { isResting } from "@/lib/setups/resting";
import { EXECUTE_SCORE_THRESHOLD } from "@/lib/scoring/weights";
import { chooseSweepBasis } from "@/lib/scan/universeSweep";

/** Setups the scheduled intraday scan times at once (engineering, labelled). */
export const SESSION_SETUPS_MAX = 24;
/** Setups added to a person's own refresh of the scanner (engineering, labelled). */
export const SESSION_SETUPS_ON_DEMAND = 9;
/** Rows older than this (calendar days) are not read: they span a weekend and a holiday. */
const MAX_AGE_DAYS = 5;

/** One row of the latest daily lists, as read here. */
export interface ListRow {
  symbol: string;
  direction: string | null;
  score: number | string | null;
  output_state: string | null;
  entry: number | string | null;
  take_profit_1?: number | string | null;
  master_profit?: number | string | null;
  detail?: { currentPrice?: unknown; dayRange?: unknown; retired?: unknown; planExpired?: unknown } | null;
}

/** One row of the overnight sweep, as read here. */
export interface SweepRow {
  symbol: string;
  score: number | string | null;
  output_state: string | null;
}

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** A list row with an entry within a day's range of price, neither retired nor expired. */
function listRowLive(row: ListRow): boolean {
  if (row.detail?.retired === true || row.detail?.planExpired === true) return false;
  if (num(row.entry) == null) return false;
  return !isResting({
    side: row.direction === "bearish" ? "sell" : "buy",
    price: num(row.detail?.currentPrice),
    entry: num(row.entry),
    dayRange: num(row.detail?.dayRange),
    tp1: num(row.take_profit_1),
    mtp: num(row.master_profit),
  });
}

/**
 * The session's setups, best first, at most `max`. Pure: the loader below
 * reads the rows. A symbol listed twice (a Buy and a Sell row) takes its
 * better tier.
 */
export function rankSessionSetups(
  listRows: readonly ListRow[],
  sweepRows: readonly SweepRow[],
  max = SESSION_SETUPS_MAX,
  listsAreLater = true,
): string[] {
  const best = new Map<string, { tier: number; score: number }>();
  const offer = (symbol: string, tier: number, score: number | null) => {
    const s = symbol.trim().toUpperCase();
    if (!s) return;
    const prior = best.get(s);
    const sc = score ?? -Infinity;
    if (!prior || tier < prior.tier || (tier === prior.tier && sc > prior.score)) best.set(s, { tier, score: sc });
  };

  // Whichever read is later stands for a symbol both read: the lists once
  // the session's scans have written them, the sweep between the night's
  // sweep and the first scan of the day (`listsAreLater` false), when the
  // newest lists are the previous session's.
  const readByLists = new Set(listRows.map((r) => r.symbol.trim().toUpperCase()));
  const readBySweep = new Set(sweepRows.map((r) => r.symbol.trim().toUpperCase()));
  for (const row of listRows) {
    const symbol = row.symbol.trim().toUpperCase();
    if (!listsAreLater && readBySweep.has(symbol)) continue;
    const score = num(row.score);
    if (!listRowLive(row)) continue;
    if (row.output_state === "Execute") offer(symbol, 0, score);
    else if (row.output_state === "Watch" && score != null && score >= EXECUTE_SCORE_THRESHOLD) offer(symbol, 2, score);
  }
  for (const row of sweepRows) {
    const symbol = row.symbol.trim().toUpperCase();
    if (row.output_state !== "Execute" || (listsAreLater && readByLists.has(symbol))) continue;
    offer(symbol, 1, num(row.score));
  }

  return [...best.entries()]
    .sort(([a, x], [b, y]) => x.tier - y.tier || y.score - x.score || (a < b ? -1 : a > b ? 1 : 0))
    .slice(0, Math.max(0, max))
    .map(([symbol]) => symbol);
}

/**
 * Reads the latest lists and the latest overnight sweep and ranks them. A
 * read that fails contributes nothing; with neither, the list is empty and the
 * intraday scan keeps its focus list and watchlists, as before.
 */
export async function loadSessionSetups(supabase: SupabaseClient, now: Date, max = SESSION_SETUPS_MAX): Promise<string[]> {
  const since = new Date(now.getTime() - MAX_AGE_DAYS * 86_400_000);
  const sinceDate = since.toISOString().slice(0, 10);

  const lists = async (): Promise<{ date: string | null; rows: ListRow[] }> => {
    const { data: latest } = await supabase
      .from("daily_scans")
      .select("scan_date")
      .gte("scan_date", sinceDate)
      .order("scan_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!latest?.scan_date) return { date: null, rows: [] };
    const { data, error } = await supabase
      .from("daily_scans")
      .select("symbol, direction, score, output_state, entry, take_profit_1, master_profit, detail")
      .eq("scan_date", latest.scan_date);
    if (error || !data) return { date: null, rows: [] };
    return { date: String(latest.scan_date), rows: data as ListRow[] };
  };

  // The same night the market scan reads (`chooseSweepBasis`: the newest that
  // scored at least half the universe), so both surfaces start from one sweep.
  const sweep = async (): Promise<{ date: string | null; rows: SweepRow[] }> => {
    const basis = await chooseSweepBasis(supabase, now);
    if (!basis) return { date: null, rows: [] };
    const { data, error } = await supabase
      .from("universe_sweep")
      .select("symbol, score, output_state")
      .eq("basis_date", basis)
      // Every state, so a later sweep can overrule a list row it no longer
      // reads as Execute; only its Execute rows are ranked.
      .limit(2000);
    if (error || !data) return { date: null, rows: [] };
    return { date: basis, rows: data as SweepRow[] };
  };

  const empty = { date: null, rows: [] };
  const [l, s] = await Promise.all([lists().catch(() => empty), sweep().catch(() => empty)]);
  // A sweep is filed under the session it is for, so lists of that date or
  // later were written after it.
  const listsAreLater = l.date == null || s.date == null || l.date >= s.date;
  return rankSessionSetups(l.rows as ListRow[], s.rows as SweepRow[], max, listsAreLater);
}

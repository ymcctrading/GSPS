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
 * Execute is one placeable that day. A sweep Execute the lists never publish
 * (the market scan re-scores the sweep's best first, but publishes only its
 * lists) keeps its plan on the sweep row (migration 0130, SUS-21): the
 * intraday scan times it from there (`dailyPlans.ts`), and once the session
 * trades through its stop `invalidateBrokenSweep` marks the row and it leaves
 * the session's setups until the next night's sweep reads new structure. A
 * sweep row stored before 0128 has no stop and stays on, as before.
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
import { barSession, etDateKey, etParts } from "@/lib/market/session";
import { isEarlyClose } from "@/lib/market/calendar";

/** 1:00 PM New York, an early close's last minute of trading, in minutes from midnight. */
const EARLY_CLOSE_ET_MINUTES = 13 * 60;

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
  /** Set once the session traded through the row's stop (migration 0130). */
  invalidated_at?: string | null;
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
    if (row.output_state !== "Execute" || row.invalidated_at || (listsAreLater && readByLists.has(symbol))) continue;
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
export async function loadSessionSetups(
  supabase: SupabaseClient,
  now: Date,
  max = SESSION_SETUPS_MAX,
  sweepBasis?: string | null,
): Promise<string[]> {
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
    const basis = sweepBasis === undefined ? await chooseSweepBasis(supabase, now) : sweepBasis;
    if (!basis) return { date: null, rows: [] };
    const { data, error } = await supabase
      .from("universe_sweep")
      .select("symbol, score, output_state, invalidated_at")
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

/** A sweep row's stored plan, as the breach test reads it. */
export interface SweepPlanRow {
  symbol: string;
  direction: string | null;
  stop_loss: number | string | null;
  /** When the plan was priced; only bars after it can break it. */
  swept_at: string | null;
}

/** A session's bars as the breach tests read them. */
export interface BreachBars {
  kind: "equity" | "etf" | "index" | "crypto";
  bars: readonly { t: string; h: number; l: number }[];
}

/**
 * The bars that can break a plan priced at `sinceMs`: printed after it, and
 * for a stock or fund in the regular session only, so a pre- or post-market
 * print never retires a plan (the rule the Intraday exits keep,
 * `lib/gann/intradayExit.ts`; 1 PM on an early close), and a holiday's scan, which reads the session
 * before, never breaks a plan priced from that session. A plan with no
 * pricing time reads every regular-session bar.
 */
export function barsSincePlan(input: BreachBars, sinceMs: number): { h: number; l: number }[] {
  return input.bars.filter((b) => {
    const at = Date.parse(b.t);
    if (!Number.isFinite(at) || (Number.isFinite(sinceMs) && at <= sinceMs)) return false;
    if (input.kind === "crypto") return true;
    if (barSession(b.t, "us_equity") !== "regular") return false;
    // An NYSE early close ends the session at 1 PM (`calendar.ts#isEarlyClose`).
    const day = new Date(at);
    return !isEarlyClose(etDateKey(day)) || etParts(day).minutes < EARLY_CLOSE_ET_MINUTES;
  });
}

/**
 * True when the bars traded through the stop: a buy's low at or below it, a
 * sell's high at or above it. A caught stop ends the plan (Overnight Chart
 * rule 4; NSTD Rule 6). No bars, no stop or no direction is never a breach.
 */
export function stopTraded(direction: string | null, stop: number | null, bars: readonly { h: number; l: number }[]): boolean {
  if (stop == null || !(stop > 0) || bars.length === 0) return false;
  if (direction === "bullish" || direction === "up") return Math.min(...bars.map((b) => b.l)) <= stop;
  if (direction === "bearish" || direction === "down") return Math.max(...bars.map((b) => b.h)) >= stop;
  return false;
}

/**
 * The sweep rows whose stop the session traded through after the row was
 * priced. A symbol with no session bars is never broken here. Pure.
 */
export function brokenSweepSymbols(rows: readonly SweepPlanRow[], session: ReadonlyMap<string, BreachBars>): string[] {
  const out: string[] = [];
  for (const row of rows) {
    const input = session.get(row.symbol.trim().toUpperCase());
    if (!input) continue;
    const since = row.swept_at ? Date.parse(row.swept_at) : NaN;
    if (stopTraded(row.direction, num(row.stop_loss), barsSincePlan(input, since))) out.push(row.symbol);
  }
  return out;
}

/**
 * Marks the night's sweep rows (`basis`, resolved once by the caller) whose
 * stop the session traded through, so the next scan's `loadSessionSetups`
 * and `loadDailyPlans` leave them out (a breach retires the plan, owner
 * 2026-09-30). One read and at most one write a scan, best-effort: a failure
 * leaves the rows on for another scan.
 */
export async function invalidateBrokenSweep(
  supabase: SupabaseClient,
  basis: string | null,
  session: ReadonlyMap<string, BreachBars>,
  now: Date,
): Promise<void> {
  const symbols = [...session.keys()];
  if (!basis || symbols.length === 0) return;
  const { data, error } = await supabase
    .from("universe_sweep")
    .select("symbol, direction, stop_loss, swept_at")
    .eq("basis_date", basis)
    .in("symbol", symbols)
    .in("output_state", ["Execute", "Watch"])
    .is("invalidated_at", null)
    .not("stop_loss", "is", null);
  if (error || !data) return;
  const broken = brokenSweepSymbols(data as SweepPlanRow[], session);
  if (broken.length === 0) return;
  const { error: writeError } = await supabase
    .from("universe_sweep")
    .update({ invalidated_at: now.toISOString(), invalidated_reason: "stop traded in the session" })
    .eq("basis_date", basis)
    .in("symbol", broken)
    .is("invalidated_at", null);
  if (writeError) console.error("[intraday-scan] sweep invalidation not written:", writeError.message);
}

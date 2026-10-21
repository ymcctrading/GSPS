/**
 * Paper-account equity: how it is marked, and its record over time
 * (docs/SYNTHESIZED_ROADMAP.md Part 5 item 13; migration 0101).
 *
 * Equity is cash plus each open position at its mark, a short counted
 * against the account: a short sale credits its notional to cash
 * (`executeFill`), so the shares owed back are a liability. `/api/portfolio`
 * reads equity through `paperEquity` too, so the figure a member sees and the
 * one recorded here are the same.
 *
 * One row per account per New York session date keeps the latest mark and
 * the day's high and low marks. The scheduled portfolio-manager pass marks
 * every paper account with an open position (every 15 minutes in market
 * hours, migration 0089), and the portfolio page marks the member's own.
 * Promotion reads the high-water drawdown from it (`paperDrawdownPct`).
 *
 * Three-question basis: 1. Gann: he kept a record of every trade and read his
 * capital rules back from it (*Tunnel Thru the Air* pp. 198-199, the profit
 * peak; the series of losses); this is that record for the account as a
 * whole. 2. Cycles: no periodicity claim; the session date is a bookkeeping
 * key. 3. Hermetic: Cause and Effect, a drawdown is read from what the
 * account actually went through, not inferred from closed trades alone.
 * Law of Creation: realized ⊗ open, a creation; neither the closed trades nor
 * today's open positions alone give the drawdown a member lived through.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { etDateKey } from "@/lib/market/session";
import { assetClassOf, quoteOptionPrice, quotePrice, STARTING_CASH } from "@/lib/brokers/simulator";
import { parseOccSymbol } from "@/lib/portfolio/occ";

export interface MarkedPosition {
  side: "long" | "short";
  qty: number;
  price: number;
}

/** Cash plus longs at their mark, less shorts at theirs. */
export function paperEquity(cash: number, positions: MarkedPosition[]): number {
  return positions.reduce((sum, p) => sum + (p.side === "short" ? -1 : 1) * p.price * p.qty, cash);
}

export interface EquityMark {
  equity: number;
  cash: number;
  openPositions: number;
}

/**
 * Record marks for several accounts. The database folds each into its day's
 * high and low in one statement (`record_paper_equity_marks`, migration 0101),
 * so the scheduled pass and a member's portfolio poll writing the same row at
 * once can't drop either one's high or low.
 */
export async function recordPaperEquityMarks(
  service: SupabaseClient,
  marks: Map<string, EquityMark>,
  now: Date = new Date(),
): Promise<{ recorded: number; error: string | null }> {
  if (marks.size === 0) return { recorded: 0, error: null };
  const sessionDate = etDateKey(now);
  const rows = [...marks].map(([id, mark]) => ({
    profile_id: id,
    session_date: sessionDate,
    equity: mark.equity,
    cash: mark.cash,
    open_positions: mark.openPositions,
    recorded_at: now.toISOString(),
  }));
  const { data, error } = await service.rpc("record_paper_equity_marks", { p_marks: rows });
  return error ? { recorded: 0, error: error.message } : { recorded: Number(data ?? rows.length), error: null };
}

const POSITION_PAGE = 1000;
const QUOTE_CONCURRENCY = 6;

interface OpenRow {
  id: string;
  user_id: string;
  symbol: string;
  side: "long" | "short";
  qty: number | string;
  avg_entry_price: number | string;
}

/**
 * Marks every paper account holding an open position, quoting each symbol
 * once. A symbol with no quote is marked at its entry, as the portfolio page
 * does. An account with nothing open is not re-marked: its equity is its cash
 * and has not moved since its last close.
 */
export async function markAllPaperEquity(
  service: SupabaseClient,
  now: Date = new Date(),
): Promise<{ accounts: number; recorded: number; error: string | null }> {
  // Every open paper position, a page at a time, so a large book is never
  // marked from part of its positions.
  const rows: OpenRow[] = [];
  for (let from = 0; ; from += POSITION_PAGE) {
    const { data: page, error } = await service
      .from("positions")
      .select("id, user_id, symbol, side, qty, avg_entry_price")
      .eq("mode", "paper")
      .eq("closed", false)
      .order("id", { ascending: true })
      .range(from, from + POSITION_PAGE - 1);
    if (error) return { accounts: 0, recorded: 0, error: error.message };
    rows.push(...((page ?? []) as OpenRow[]));
    if ((page ?? []).length < POSITION_PAGE) break;
  }
  if (rows.length === 0) return { accounts: 0, recorded: 0, error: null };

  const users = [...new Set(rows.map((r) => r.user_id))];
  const { data: accounts, error: accountError } = await service
    .from("paper_accounts")
    .select("user_id, cash")
    .in("user_id", users);
  if (accountError) return { accounts: 0, recorded: 0, error: accountError.message };
  const cashBy = new Map(((accounts ?? []) as { user_id: string; cash: number | string }[]).map((a) => [a.user_id, Number(a.cash)]));

  const symbols = [...new Set(rows.map((r) => r.symbol))];
  // A few quotes at a time: this runs at the end of the scheduled pass, and a
  // burst of one request per symbol would crowd the market-data key.
  const quotes = new Map<string, number | null>();
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(QUOTE_CONCURRENCY, symbols.length) }, async () => {
      while (next < symbols.length) {
        const s = symbols[next++];
        const price = await (parseOccSymbol(s) ? quoteOptionPrice(s) : quotePrice(s, assetClassOf(s))).catch(() => null);
        quotes.set(s, price);
      }
    }),
  );

  const marks = new Map<string, EquityMark>();
  for (const userId of users) {
    const held = rows.filter((r) => r.user_id === userId);
    const cash = cashBy.get(userId) ?? STARTING_CASH;
    const equity = paperEquity(
      cash,
      held.map((r) => ({
        side: r.side === "short" ? "short" : "long",
        qty: Number(r.qty),
        price: quotes.get(r.symbol) ?? Number(r.avg_entry_price),
      })),
    );
    marks.set(userId, { equity, cash, openPositions: held.length });
  }
  const result = await recordPaperEquityMarks(service, marks, now);
  return { accounts: users.length, ...result };
}

/** The deepest fall from a prior high, in percent, across marks in time order. */
export function maxDrawdownPct(marks: { high: number; low: number }[], startingEquity: number): number {
  let peak = startingEquity;
  let worst = 0;
  for (const m of marks) {
    // A day's low may have come before its high; reading the low against the
    // peak before the day keeps the drawdown from being invented inside one day.
    if (peak > 0) worst = Math.max(worst, (peak - m.low) / peak);
    peak = Math.max(peak, m.high);
  }
  return worst * 100;
}

/**
 * The account's high-water drawdown since `since`, in percent, or null when
 * no mark has been recorded in that window or the record can't be read. The
 * peak starts at the latest mark before the window. With none, it starts at
 * the window's first low: the record holds no earlier peak, and a balance the
 * account may have lost before the window is not one it fell from inside it
 * (Gann reads the drawdown from the account's own record, not an assumed one).
 */
export async function paperDrawdownPct(
  service: SupabaseClient,
  profileId: string,
  since: Date,
): Promise<number | null> {
  const sinceKey = etDateKey(since);
  const [{ data: inWindow, error }, { data: before, error: beforeError }] = await Promise.all([
    service
      .from("paper_equity_snapshots")
      .select("session_date, high_equity, low_equity")
      .eq("profile_id", profileId)
      .gte("session_date", sinceKey)
      .order("session_date", { ascending: true }),
    service
      .from("paper_equity_snapshots")
      .select("equity")
      .eq("profile_id", profileId)
      .lt("session_date", sinceKey)
      .order("session_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (error || beforeError || !inWindow || inWindow.length === 0) return null;
  const marks = (inWindow as { high_equity: number | string; low_equity: number | string }[]).map((r) => ({
    high: Number(r.high_equity),
    low: Number(r.low_equity),
  }));
  const start = before ? Number((before as { equity: number | string }).equity) : marks[0].low;
  return maxDrawdownPct(marks, start);
}

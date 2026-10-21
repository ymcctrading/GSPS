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

interface SnapshotRow {
  profile_id: string;
  session_date: string;
  equity: number | string;
  high_equity: number | string;
  low_equity: number | string;
}

/** Record marks for several accounts, folding each into its day's high and low. */
export async function recordPaperEquityMarks(
  service: SupabaseClient,
  marks: Map<string, EquityMark>,
  now: Date = new Date(),
): Promise<{ recorded: number; error: string | null }> {
  if (marks.size === 0) return { recorded: 0, error: null };
  const sessionDate = etDateKey(now);
  const ids = [...marks.keys()];
  const { data: existing, error: readError } = await service
    .from("paper_equity_snapshots")
    .select("profile_id, session_date, equity, high_equity, low_equity")
    .eq("session_date", sessionDate)
    .in("profile_id", ids);
  if (readError) return { recorded: 0, error: readError.message };
  const today = new Map(((existing ?? []) as SnapshotRow[]).map((r) => [r.profile_id, r]));

  const rows = ids.map((id) => {
    const mark = marks.get(id)!;
    const prior = today.get(id);
    return {
      profile_id: id,
      session_date: sessionDate,
      equity: mark.equity,
      cash: mark.cash,
      high_equity: prior ? Math.max(Number(prior.high_equity), mark.equity) : mark.equity,
      low_equity: prior ? Math.min(Number(prior.low_equity), mark.equity) : mark.equity,
      open_positions: mark.openPositions,
      recorded_at: now.toISOString(),
    };
  });
  const { error } = await service.from("paper_equity_snapshots").upsert(rows, { onConflict: "profile_id,session_date" });
  return error ? { recorded: 0, error: error.message } : { recorded: rows.length, error: null };
}

interface OpenRow {
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
  const { data: open, error } = await service
    .from("positions")
    .select("user_id, symbol, side, qty, avg_entry_price")
    .eq("mode", "paper")
    .eq("closed", false)
    .limit(5000);
  if (error) return { accounts: 0, recorded: 0, error: error.message };
  const rows = (open ?? []) as OpenRow[];
  if (rows.length === 0) return { accounts: 0, recorded: 0, error: null };

  const users = [...new Set(rows.map((r) => r.user_id))];
  const { data: accounts, error: accountError } = await service
    .from("paper_accounts")
    .select("user_id, cash")
    .in("user_id", users);
  if (accountError) return { accounts: 0, recorded: 0, error: accountError.message };
  const cashBy = new Map(((accounts ?? []) as { user_id: string; cash: number | string }[]).map((a) => [a.user_id, Number(a.cash)]));

  const symbols = [...new Set(rows.map((r) => r.symbol))];
  const quotes = new Map(
    await Promise.all(
      symbols.map(async (s) => {
        const price = await (parseOccSymbol(s) ? quoteOptionPrice(s) : quotePrice(s, assetClassOf(s))).catch(() => null);
        return [s, price] as const;
      }),
    ),
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
 * no mark has been recorded in that window. The peak starts at the latest
 * mark before the window, or the starting balance when there is none.
 */
export async function paperDrawdownPct(
  service: SupabaseClient,
  profileId: string,
  since: Date,
): Promise<number | null> {
  const sinceKey = etDateKey(since);
  const [{ data: inWindow, error }, { data: before }] = await Promise.all([
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
  if (error || !inWindow || inWindow.length === 0) return null;
  const start = before ? Number((before as { equity: number | string }).equity) : STARTING_CASH;
  return maxDrawdownPct(
    (inWindow as { high_equity: number | string; low_equity: number | string }[]).map((r) => ({
      high: Number(r.high_equity),
      low: Number(r.low_equity),
    })),
    start,
  );
}

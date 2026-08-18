/**
 * Guided Decision Mode — what the caps currently allow, read from the ledger.
 *
 * Three limits, all evaluated against the recommendation ledger rather than
 * against the orders table, because Guided Mode's caps are about *this mode*:
 * a user who places trades from the ticker page has looked at the numbers, and
 * capping those would be the app overriding a decision it did not make.
 *
 * The counts are read immediately before a recommendation is rendered and again
 * immediately before an order is submitted. Doing it once would leave the gap
 * between the two open — two tabs, or a card left on screen while the day's
 * third trade was placed elsewhere, would both slip a fourth trade through.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { etDateKey } from "@/lib/market/session";
import type { GuidedCaps } from "@/lib/guided/config";

export interface CapUsage {
  tradesToday: number;
  tradesThisWeek: number;
  /** Capital tied up in open positions opened through Guided Mode, in dollars. */
  deployedUsd: number;
  deployedPct: number;
  /** Null when nothing is blocking a new trade; otherwise the sentence to show. */
  blockedReason: string | null;
}

/** Executed guided recommendations still holding an open position. */
interface ExecutedRow {
  symbol: string;
  qty: number;
  agreed_entry: number;
  resolved_at: string | null;
}

/**
 * `now` is injectable so the day/week boundaries can be tested without moving
 * the system clock. Days are Eastern trading days — the same key the daily scan
 * files itself under — so "three a day" means three in one session, not three
 * per UTC midnight, which would split the US afternoon in half.
 */
export async function readCapUsage(
  supabase: SupabaseClient,
  userId: string,
  caps: GuidedCaps,
  equity: number,
  openSymbols: Map<string, { qty: number; avgEntry: number }>,
  now: Date = new Date(),
): Promise<CapUsage> {
  const weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString();

  const { data } = await supabase
    .from("guided_recommendations")
    .select("symbol, qty, agreed_entry, resolved_at")
    .eq("user_id", userId)
    .eq("status", "executed")
    .gte("resolved_at", weekAgo)
    .order("resolved_at", { ascending: false });

  const executed = (data ?? []) as ExecutedRow[];
  const today = etDateKey(now);
  const tradesToday = executed.filter(
    (r) => r.resolved_at != null && etDateKey(new Date(r.resolved_at)) === today,
  ).length;
  const tradesThisWeek = executed.length;

  // Deployed capital is measured against positions that are still open, at the
  // price they were opened at. A guided trade that has already been closed is
  // not tying anything up, and marking the deployed figure to market would make
  // the cap tighten as trades went well — which is not what a cap on how much
  // the mode may commit is for.
  let deployedUsd = 0;
  const counted = new Set<string>();
  for (const row of executed) {
    const key = row.symbol.toUpperCase();
    if (counted.has(key)) continue;
    const open = openSymbols.get(key);
    if (!open) continue;
    counted.add(key);
    deployedUsd += open.qty * open.avgEntry;
  }

  const deployedPct = equity > 0 ? (deployedUsd / equity) * 100 : 0;

  return {
    tradesToday,
    tradesThisWeek,
    deployedUsd,
    deployedPct,
    blockedReason: blockingReason({ tradesToday, tradesThisWeek, deployedPct }, caps),
  };
}

function blockingReason(
  usage: { tradesToday: number; tradesThisWeek: number; deployedPct: number },
  caps: GuidedCaps,
): string | null {
  if (usage.tradesToday >= caps.maxTradesPerDay) {
    return `You've opened ${usage.tradesToday} guided position${usage.tradesToday === 1 ? "" : "s"} today, which is the daily cap. Guided Mode is done for the day — the scanner and the ticker pages are unaffected.`;
  }
  if (usage.tradesThisWeek >= caps.maxTradesPerWeek) {
    return `You've opened ${usage.tradesThisWeek} guided positions in the past seven days, which is the weekly cap.`;
  }
  if (usage.deployedPct >= caps.maxDeployedPct) {
    return `Guided Mode is holding ${usage.deployedPct.toFixed(0)}% of your paper equity in open positions, which is its cap. Close one to free up room.`;
  }
  return null;
}

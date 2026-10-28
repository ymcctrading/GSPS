/**
 * Which levels a trade was placed on (owner, 2026-10-28: "allow for an option
 * to trade the swing plan, the intraday plan, or use the users own sl, tp1,
 * and mtp levels"), kept with the trade so every surface that shows or acts on
 * it afterwards says the same thing: the position cards and their Edit flow,
 * and the notices about a held symbol (`orders.level_source`, migration 0131).
 *
 * The management of the trade is unchanged by this: the exit managers still
 * read `intraday_sourced` for the Intraday style (`lib/trade/exit-style.ts`)
 * and the stored stop, TP1 and MTP for the levels. This names the source.
 *
 * Three-question basis: 1. Gann chooses the method at entry and keeps the
 * trade on it (W006 Rule 2, the style fixed at the fill), so the choice is the
 * order's own and never re-read from today's plan. 2. No periodicity claim.
 * 3. Correspondence: one stored choice, read the same way on every surface.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type LevelSource = "swing" | "intraday" | "own";

export const LEVEL_SOURCES: readonly LevelSource[] = ["swing", "intraday", "own"];

/** How each choice reads on a position card and in a notice. */
export const LEVEL_SOURCE_LABELS: Record<LevelSource, string> = {
  swing: "Swing plan",
  intraday: "Intraday plan",
  own: "Your own levels",
};

/** What a trade was placed on, said as a sentence (it stays true after an edit). */
export const LEVEL_SOURCE_PLACED_ON: Record<LevelSource, string> = {
  swing: "Placed on the swing plan",
  intraday: "Placed on the intraday plan",
  own: "Placed on your own levels",
};

/**
 * The choice to store on a new order. The ticket's explicit choice when it
 * agrees with how the order is managed; otherwise what the order itself says:
 * an intraday trade is the intraday plan, an automated one (a `trade_plans`
 * row behind it) is the swing plan, a technique's levels are the person's own.
 * Null when nothing says (a market order with no levels attached).
 *
 * "Intraday plan" needs the intraday management, and "Swing plan" can't have
 * it; "Your own levels" may be managed either way (the ticket's "Manage it as
 * an intraday trade" box).
 */
export function resolveLevelSource(input: {
  levelSource?: LevelSource;
  intradaySourced?: boolean;
  sourcePlanId?: string;
  techniqueSource?: string;
  hasLevels: boolean;
}): LevelSource | null {
  const intraday = input.intradaySourced === true;
  const chosen = input.levelSource;
  if (chosen === "own" && input.hasLevels) return "own";
  if (chosen === "intraday" && intraday) return "intraday";
  if (chosen === "swing" && !intraday && input.hasLevels) return "swing";
  if (input.techniqueSource && input.hasLevels) return "own";
  if (intraday) return "intraday";
  if (input.sourcePlanId) return "swing";
  return null;
}

interface OrderSourceRow {
  level_source?: string | null;
  intraday_sourced?: boolean | null;
  source_plan_id?: string | null;
}

/**
 * The choice an order row records. Rows written before migration 0131 carry
 * none, so the intraday flag and the automation link answer for them, and a
 * manual order of that age stays unknown rather than guessed.
 */
export function readLevelSource(row: OrderSourceRow): LevelSource | null {
  const stored = row.level_source;
  if (stored === "swing" || stored === "intraday" || stored === "own") return stored;
  if (row.intraday_sourced) return "intraday";
  if (row.source_plan_id) return "swing";
  return null;
}

/**
 * The choice behind each open position of one account mode, by symbol (upper
 * case), read from its working exit's entry order. A paper exit's
 * `entry_order_id` is the order's id, a live one the broker's order id. A
 * symbol whose source can't be read is left out; a failed read returns an
 * empty map, so a card simply shows no label.
 */
export async function readPositionLevelSources(
  supabase: SupabaseClient,
  userId: string,
  mode: "paper" | "live",
  symbol?: string,
): Promise<Map<string, LevelSource>> {
  const out = new Map<string, LevelSource>();
  try {
    let exitsQuery = supabase
      .from("protocol_exits")
      .select("symbol, entry_order_id")
      .eq("user_id", userId)
      .eq("mode", mode)
      .eq("status", "working")
      .is("merged_into", null);
    if (symbol) exitsQuery = exitsQuery.eq("symbol", symbol.toUpperCase());
    const { data: exits, error } = await exitsQuery;
    if (error || !exits?.length) return out;
    const bySymbol = new Map<string, string>();
    for (const e of exits as { symbol: string; entry_order_id: string | null }[]) {
      if (e.entry_order_id) bySymbol.set(e.symbol.toUpperCase(), e.entry_order_id);
    }
    if (bySymbol.size === 0) return out;
    const key = mode === "paper" ? "id" : "broker_order_id";
    const { data: orders, error: ordersError } = await supabase
      .from("orders")
      .select(`${key}, level_source, intraday_sourced, source_plan_id`)
      .eq("user_id", userId)
      .in(key, [...bySymbol.values()]);
    if (ordersError || !orders) return out;
    const byOrder = new Map<string, LevelSource>();
    for (const o of orders as (OrderSourceRow & Record<string, unknown>)[]) {
      const source = readLevelSource(o);
      if (source) byOrder.set(String(o[key]), source);
    }
    for (const [sym, orderId] of bySymbol) {
      const source = byOrder.get(orderId);
      if (source) out.set(sym, source);
    }
  } catch {
    return out;
  }
  return out;
}

/**
 * The choice behind a held position in `symbol`, paper first, then live: what
 * a notice about the symbol says the position runs on. Null when nothing is
 * held, the source is unknown, or it can't be read.
 */
export async function heldPositionLevelSource(
  supabase: SupabaseClient,
  userId: string,
  symbol: string,
): Promise<LevelSource | null> {
  const sym = symbol.toUpperCase();
  for (const mode of ["paper", "live"] as const) {
    const source = (await readPositionLevelSources(supabase, userId, mode, sym)).get(sym);
    if (source) return source;
  }
  return null;
}

/**
 * The sentence a notice about a broken daily setup adds for a member holding
 * the symbol on levels that aren't the swing plan's: the setup breaking is
 * not their exit, which runs on its own stop. Null for the swing plan or an
 * unknown source, where the notice stands as written.
 */
export function heldOffPlanNote(symbol: string, heldOn: LevelSource | null | undefined): string | null {
  if (heldOn === "own") return `Your ${symbol} position runs on your own levels, so this doesn't move its stop.`;
  if (heldOn === "intraday") return `Your ${symbol} position runs on the intraday plan, so this doesn't move its stop.`;
  return null;
}

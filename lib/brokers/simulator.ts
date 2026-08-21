/**
 * Simulated paper broker.
 * -----------------------------------------------------------------------------
 * Every signed-in user used to trade "paper" against the same real Alpaca
 * paper account (one set of API keys in server env vars — see the removed
 * `envCreds("paper")` call sites). A brand-new signup saw, and could act on,
 * whatever that shared account already held. There is no real broker here
 * anymore for paper mode: fills happen synchronously against live market
 * prices and are written straight to this app's own `positions` / `orders` /
 * `paper_accounts` tables, which already carry `user_id` and RLS — the same
 * isolation every other per-user table in this app relies on.
 *
 * A real broker is asynchronous: an order is *accepted*, and the fill (and its
 * price) arrives later, which is why the rest of this codebase has a pending →
 * settle two-step for trade logs (`lib/portfolio/trade-log-settle.ts`) and a
 * reconcile-against-the-broker poll (`lib/portfolio/reconcile.ts`). Neither is
 * needed here: this module *is* the fill, so the price is known the instant it
 * happens and every write below is synchronous and final.
 *
 * Scope. Equities are fully simulated: live quotes from the market-data
 * provider already used everywhere else in the app. Options try a live
 * per-contract quote first (`quoteOptionPrice`, Alpaca's options trades
 * endpoint) and fall back to the ticket's own known premium when that isn't
 * available — no options market-data subscription on the account, or the
 * contract hasn't traded recently. A leg marked from the fallback is
 * end-of-day accurate rather than tick-by-tick.
 */

import { getMarketDataProvider } from "@/lib/data/provider";
import { isCryptoSymbol, fetchOptionLatestTrade } from "@/lib/data/alpaca";
import { parseOccSymbol } from "@/lib/portfolio/occ";
import {
  isInvalidatedByStop,
  invalidationReason,
  type InvalidatableOrder,
} from "@/lib/trade/invalidate-pending";
import { sendOrderInvalidatedEmail } from "@/lib/notifications/resend-handler";
import type { createClient } from "@/lib/supabase/server";
import type { AssetClass } from "@/lib/types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Every new simulated account starts with the same balance. */
export const STARTING_CASH = 100_000;

export interface SimAccount {
  cash: number;
}

/** Reads the user's simulated cash balance, creating the account on first use. */
export async function getOrCreateAccount(supabase: Supabase, userId: string): Promise<SimAccount> {
  const { data } = await supabase
    .from("paper_accounts")
    .select("cash")
    .eq("user_id", userId)
    .maybeSingle();
  if (data) return { cash: Number(data.cash) };

  const { data: inserted, error } = await supabase
    .from("paper_accounts")
    .insert({ user_id: userId, cash: STARTING_CASH })
    .select("cash")
    .maybeSingle();
  // A concurrent request may have created it first (unique on user_id) —
  // that's a lost race, not a failure, so read back what's actually there.
  if (error || !inserted) {
    const { data: existing } = await supabase
      .from("paper_accounts")
      .select("cash")
      .eq("user_id", userId)
      .maybeSingle();
    return { cash: Number(existing?.cash ?? STARTING_CASH) };
  }
  return { cash: Number(inserted.cash) };
}

/**
 * Move cash by `delta` (negative debits, positive credits) with a single
 * atomic statement — see migration 0011 for why a read-then-write update
 * isn't safe here. The account row has to exist first (`getOrCreateAccount`);
 * this only ever adjusts an existing one.
 */
export async function adjustCash(supabase: Supabase, userId: string, delta: number): Promise<void> {
  const { error } = await supabase.rpc("increment_paper_cash", { p_user_id: userId, p_delta: delta });
  if (error) throw new Error(`Cash update failed for user ${userId}: ${error.message}`);
}

/** The `positions` columns the simulator reads and writes. */
export interface SimPosition {
  id: string;
  symbol: string;
  asset_class: string;
  side: "long" | "short";
  qty: number;
  avg_entry_price: number;
  opened_at: string;
  stop_loss: number | null;
  take_profit: number | null;
  master_profit: number | null;
  scan_result_id: string | null;
}

export async function getOpenPosition(
  supabase: Supabase,
  userId: string,
  symbol: string,
): Promise<SimPosition | null> {
  const { data } = await supabase
    .from("positions")
    .select("*")
    .eq("user_id", userId)
    .eq("symbol", symbol.toUpperCase())
    .eq("closed", false)
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? normalizePosition(data) : null;
}

export async function listOpenPositions(supabase: Supabase, userId: string): Promise<SimPosition[]> {
  const { data } = await supabase
    .from("positions")
    .select("*")
    .eq("user_id", userId)
    .eq("closed", false)
    .order("opened_at", { ascending: false });
  return (data ?? []).map(normalizePosition);
}

function normalizePosition(row: Record<string, unknown>): SimPosition {
  return {
    id: String(row.id),
    symbol: String(row.symbol),
    asset_class: String(row.asset_class ?? "us_equity"),
    side: row.side === "short" ? "short" : "long",
    qty: Number(row.qty),
    avg_entry_price: Number(row.avg_entry_price),
    opened_at: String(row.opened_at),
    stop_loss: row.stop_loss == null ? null : Number(row.stop_loss),
    take_profit: row.take_profit == null ? null : Number(row.take_profit),
    master_profit: row.master_profit == null ? null : Number(row.master_profit),
    scan_result_id: (row.scan_result_id as string | null) ?? null,
  };
}

/**
 * The live mark for a symbol. Equities and crypto read the same price feed
 * every other part of the app uses; an option symbol has no live per-contract
 * feed to read here (see the module header) — callers marking an option leg
 * fall back to its underlying's spot price or its entry price instead.
 */
export async function quotePrice(symbol: string, assetClass: AssetClass): Promise<number | null> {
  try {
    return await getMarketDataProvider().fetchLatestPrice(symbol, assetClass);
  } catch {
    return null;
  }
}

export function assetClassOf(symbol: string): AssetClass {
  return isCryptoSymbol(symbol) ? "crypto" : "us_equity";
}

export function isOption(symbol: string): boolean {
  return parseOccSymbol(symbol) !== null;
}

/**
 * Live per-contract price for an option leg, or null when there's nothing to
 * read — see the module header. Callers fall back to the underlying's spot
 * or the position's entry price; never treat null as "the contract is worth
 * nothing."
 */
export async function quoteOptionPrice(occSymbol: string): Promise<number | null> {
  return fetchOptionLatestTrade(occSymbol);
}

/**
 * The result of matching a fill against the position that was open before it.
 * A fill only ever does one of three things to a position: opens/adds to one
 * that agrees with its direction, reduces one that opposes it (partial or full
 * close), or — filling past what was held — closes it and opens the opposite
 * side with the leftover quantity, exactly like a real broker would.
 */
export interface FillOutcome {
  /** The position after this fill, or null if it's now fully flat. */
  position: { side: "long" | "short"; qty: number; avgEntryPrice: number } | null;
  /**
   * Set when this fill closed all or part of a pre-existing position — the
   * realized P/L on the closed portion, for the caller to decide whether (and
   * how) to log it.
   */
  closed: { qty: number; entryPrice: number; exitPrice: number; realizedPl: number } | null;
}

/**
 * Pure position arithmetic: no I/O, so it's exercised directly in tests
 * rather than through a database round-trip.
 *
 * `existing` is null for a fresh entry. `side`/`qty`/`price` describe the
 * fill itself — a `buy` fill against a `long` existing position adds to it at
 * a quantity-weighted average price; a `buy` against a `short` position
 * reduces (or flips) it.
 */
export function applyFill(
  existing: { side: "long" | "short"; qty: number; avgEntryPrice: number } | null,
  side: "buy" | "sell",
  qty: number,
  price: number,
): FillOutcome {
  const fillDirection: "long" | "short" = side === "buy" ? "long" : "short";

  if (!existing) {
    return { position: { side: fillDirection, qty, avgEntryPrice: price }, closed: null };
  }

  if (existing.side === fillDirection) {
    // Same direction: blend into the average entry.
    const totalQty = existing.qty + qty;
    const avgEntryPrice = (existing.avgEntryPrice * existing.qty + price * qty) / totalQty;
    return { position: { side: existing.side, qty: totalQty, avgEntryPrice }, closed: null };
  }

  // Opposing fill: reduces, flattens, or flips the existing position.
  const closingQty = Math.min(existing.qty, qty);
  const perShare =
    existing.side === "long" ? price - existing.avgEntryPrice : existing.avgEntryPrice - price;
  const closed = {
    qty: closingQty,
    entryPrice: existing.avgEntryPrice,
    exitPrice: price,
    realizedPl: perShare * closingQty,
  };

  const remaining = existing.qty - qty;
  if (remaining > 1e-9) {
    return { position: { side: existing.side, qty: remaining, avgEntryPrice: existing.avgEntryPrice }, closed };
  }
  if (remaining < -1e-9) {
    // The fill overshot what was held — flat, then flipped to the opposite
    // side for the leftover quantity, priced at this fill.
    return { position: { side: fillDirection, qty: -remaining, avgEntryPrice: price }, closed };
  }
  return { position: null, closed };
}

export interface ExecuteFillInput {
  symbol: string;
  assetClass: AssetClass;
  side: "buy" | "sell";
  qty: number;
  price: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
  masterProfit?: number | null;
  scanResultId?: string | null;
}

export interface ExecutedFill {
  price: number;
  qty: number;
  positionId: string | null;
  /** The closed portion's realized P/L, plus when the position that produced it was opened. */
  closed: (NonNullable<FillOutcome["closed"]> & { openedAt: string }) | null;
}

/**
 * Execute one fill: debit/credit cash, and write the resulting `positions`
 * row (opened, added to, reduced, closed, or flipped — see `applyFill`).
 * Cash moves by the full notional either way — a sell credits it, a buy
 * debits it — which is what makes shorting and covering both just work as
 * the mirror image of buying and selling, without a separate margin model.
 *
 * The position write goes through `execute_position_fill` (migration
 * `0012`), which locks the row with `for update` for the length of the
 * fill — the same reasoning as `adjustCash`'s atomic increment: two fills
 * for the same user+symbol landing close together (a resting order filling
 * on one poll while a fresh order for it is submitted on another) serialize
 * on the lock instead of one clobbering the other's read.
 */
export async function executeFill(
  supabase: Supabase,
  userId: string,
  input: ExecuteFillInput,
): Promise<ExecutedFill> {
  const symbol = input.symbol.toUpperCase();

  const notional = input.price * input.qty;
  await getOrCreateAccount(supabase, userId); // ensures the row exists before the increment below
  const cashDelta = input.side === "buy" ? -notional : notional;
  await adjustCash(supabase, userId, cashDelta);

  const assetClass = input.assetClass === "crypto" ? "crypto" : isOption(symbol) ? "option" : "us_equity";
  const { data, error } = await supabase.rpc("execute_position_fill", {
    p_user_id: userId,
    p_symbol: symbol,
    p_asset_class: assetClass,
    p_side: input.side,
    p_qty: input.qty,
    p_price: input.price,
    p_stop_loss: input.stopLoss ?? null,
    p_take_profit: input.takeProfit ?? null,
    p_master_profit: input.masterProfit ?? null,
    p_scan_result_id: input.scanResultId ?? null,
  });
  if (error) throw new Error(`Position fill failed for ${symbol}: ${error.message}`);

  const result = data as { positionId: string | null; closed: (NonNullable<FillOutcome["closed"]> & { openedAt: string }) | null };
  return { price: input.price, qty: input.qty, positionId: result.positionId, closed: result.closed };
}

/**
 * Whether a working protocol_exits plan currently owns this symbol. A closing
 * fill against a protocol-managed position must never also get a plain
 * trade-log write — `lib/trade/exit-manager-sim.ts` owns that log, blended
 * across every tranche, once the whole plan finishes.
 */
async function hasWorkingPlan(supabase: Supabase, userId: string, symbol: string): Promise<boolean> {
  const { data } = await supabase
    .from("protocol_exits")
    .select("id")
    .eq("user_id", userId)
    .eq("symbol", symbol.toUpperCase())
    .eq("status", "working")
    .limit(1)
    .maybeSingle();
  return data != null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Write the trade log for a fill that closed (all or part of) a plain,
 * non-protocol-managed position — the case `executeFill` on its own leaves
 * unlogged, since it has no way to know whether the caller already owns that
 * responsibility (the dedicated "Close position" action does, and writes its
 * own row). Used by callers where a close can happen incidentally — a plain
 * sell placed through the order ticket, or a resting limit order filling —
 * and nothing else would ever log it.
 */
export async function logPlainClose(
  supabase: Supabase,
  userId: string,
  symbol: string,
  assetClass: AssetClass,
  fillSide: "buy" | "sell",
  closed: NonNullable<ExecutedFill["closed"]>,
): Promise<void> {
  if (await hasWorkingPlan(supabase, userId, symbol)) return;

  // The closing fill's side is the opposite of the position it closed: a
  // sell closes a long (entered on a buy), a buy closes a short.
  const direction: "buy" | "sell" = fillSide === "sell" ? "buy" : "sell";
  const perShare = closed.qty > 0 ? closed.realizedPl / closed.qty : 0;
  const percent = closed.entryPrice === 0 ? null : round2((perShare / closed.entryPrice) * 100);

  const { error } = await supabase.from("trade_logs").insert({
    user_id: userId,
    symbol: symbol.toUpperCase(),
    asset_class: assetClass === "crypto" ? "crypto" : isOption(symbol) ? "option" : "us_equity",
    direction,
    quantity: closed.qty,
    entry_timestamp: closed.openedAt,
    entry_price: closed.entryPrice,
    exit_timestamp: new Date().toISOString(),
    exit_price: closed.exitPrice,
    outcome: closed.realizedPl >= 0 ? "profit" : "loss",
    profit_loss_dollars: round2(closed.realizedPl),
    profit_loss_percent: percent,
    exit_condition: "manual",
    signal_called: "manual order",
  });
  if (error) console.error(`simulator: trade log for ${symbol} not written — ${error.message}`);
}

/** Liquidate all (or `qty`) of an open position at the current market price. */
export async function closePositionSim(
  supabase: Supabase,
  userId: string,
  symbol: string,
  qty?: number,
): Promise<ExecutedFill | null> {
  const existing = await getOpenPosition(supabase, userId, symbol.toUpperCase());
  if (!existing) return null;
  const price = await quotePrice(symbol, assetClassOf(symbol));
  if (price == null) throw new Error(`No live price available for ${symbol} — the close wasn't simulated.`);
  const closingSide: "buy" | "sell" = existing.side === "long" ? "sell" : "buy";
  const closeQty = qty ? Math.min(qty, existing.qty) : existing.qty;
  return executeFill(supabase, userId, {
    symbol,
    assetClass: assetClassOf(symbol),
    side: closingSide,
    qty: closeQty,
    price,
  });
}

/** Whether a limit order at `limitPrice` would fill immediately against `market`. */
export function isMarketable(side: "buy" | "sell", limitPrice: number, market: number): boolean {
  return side === "buy" ? market <= limitPrice : market >= limitPrice;
}

/**
 * Fill every resting simulated limit order whose price the market has now
 * reached. Filled at the live market price, not the order's own limit — by
 * the time a resting limit is marketable, the market is already at least as
 * good as the limit (a buy's market is <= it, a sell's is >=), and that's the
 * price a real broker would report back, especially after a gap carries price
 * well past the limit between polls. Options are skipped: without a live
 * per-contract quote there's nothing to test marketability against, so an
 * option order only ever fills (or doesn't) at placement time — see the
 * option branch in `POST /api/orders`.
 */
export async function evaluateRestingOrders(
  supabase: Supabase,
  userId: string,
  userEmail?: string | null,
): Promise<{ filled: number; invalidated: number; error: string | null }> {
  const { data, error } = await supabase
    .from("orders")
    .select("id, symbol, side, qty, limit_price, stop_price, asset_class")
    .eq("user_id", userId)
    .eq("mode", "paper")
    .eq("status", "new")
    .eq("order_type", "limit");
  if (error) return { filled: 0, invalidated: 0, error: error.message };

  let filled = 0;
  let invalidated = 0;
  for (const row of data ?? []) {
    const symbol = String(row.symbol);
    if (isOption(symbol)) continue;
    const limitPrice = Number(row.limit_price);
    const side = row.side === "sell" ? "sell" : "buy";
    if (!Number.isFinite(limitPrice)) continue;

    const market = await quotePrice(symbol, assetClassOf(symbol));
    if (market == null) continue;

    if (isMarketable(side, limitPrice, market)) {
      // Claim before executing, same reasoning as the exit manager's tranche
      // claim: a concurrent poll must not fill this same resting order twice.
      const { data: claimed } = await supabase
        .from("orders")
        .update({ status: "filled", filled_qty: row.qty, filled_avg_price: market, updated_at: new Date().toISOString() })
        .eq("id", row.id)
        .eq("user_id", userId)
        .eq("status", "new")
        .select("id")
        .maybeSingle();
      if (!claimed) continue;

      const executed = await executeFill(supabase, userId, {
        symbol,
        assetClass: assetClassOf(symbol),
        side,
        qty: Number(row.qty),
        price: market,
      });
      if (executed.closed) {
        await logPlainClose(supabase, userId, symbol, assetClassOf(symbol), side, executed.closed);
      }
      filled++;
      continue;
    }

    // Never reached the entry, but the market has now hit the planned stop —
    // the setup is broken. Cancel rather than leave it resting indefinitely;
    // see lib/trade/invalidate-pending.ts.
    const stopPrice = Number(row.stop_price);
    const invalidatable: InvalidatableOrder = {
      side,
      limit_price: limitPrice,
      stop_price: Number.isFinite(stopPrice) ? stopPrice : null,
    };
    if (!isInvalidatedByStop(invalidatable, market)) continue;

    const reason = invalidationReason(invalidatable, market);
    const { data: claimed } = await supabase
      .from("orders")
      .update({ status: "rejected", reject_reason: reason, updated_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("user_id", userId)
      .eq("status", "new")
      .select("id")
      .maybeSingle();
    if (!claimed) continue;
    invalidated++;

    if (userEmail) {
      await sendOrderInvalidatedEmail({
        userEmail,
        symbol,
        side,
        qty: Number(row.qty),
        limitPrice,
        stopPrice: invalidatable.stop_price,
        reason,
      }).catch((err) => console.error(`invalidation email failed for ${symbol}:`, err));
    }
  }
  return { filled, invalidated, error: null };
}

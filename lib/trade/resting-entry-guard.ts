/**
 * Gann's capital rules read again when a resting paper entry fills
 * (review 2026-10-21, #376).
 *
 * `placeSimulatedOrder` checks an entry against the book when it is placed.
 * A limit the market has not reached rests as an `orders` row (`status =
 * 'new'`) and is filled later by `evaluateRestingOrders`
 * (lib/brokers/simulator.ts). Between the two the book can change, and two
 * entries that rested before working entries were counted at placement were
 * never checked against each other: each passed alone, and together they could
 * open a sixth stock or breach 30 points of capital a share. So the fill reads
 * the same refusals on the book as it stands at the fill: at most five stocks
 * or three other markets (crypto, funds) and 30 points of capital behind every share
 * (`capitalRuleRefusal`, A-RISK-01, Q4/Q6), and at most a tenth of the trading
 * unit at risk (`riskTenthRefusal`, never-failing rule 1, with A-RISK-07's
 * tenth of the profits). The book here is the open positions only: other
 * resting entries are not counted against a fill, or two of them could refuse
 * each other for ever.
 *
 * A resting order that only reduces a position held now is protective and is
 * never refused, as at placement.
 *
 * Gann: W006 p.46, *Commodities* pp.29-30 and rule 1 (pp.43-45), *Tunnel Thru
 * the Air* pp.198-199 (Tier A). Cycle theory: no periodicity claim. Hermetic:
 * Cause and Effect, the capital is read where the exposure is caused (the
 * fill), not only where it was asked for. Law of Creation: placement ⊗ fill,
 * one rule read at both ends, so the fill can't open what placement refuses.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { paperEquity } from "@/lib/portfolio/paper-equity";
import {
  STARTING_CASH,
  getOrCreateAccount,
  isOption,
  listOpenPositions,
} from "@/lib/brokers/simulator";
import { isProtectiveOrder } from "@/lib/trade/kill-switch";
import { capitalRuleRefusal, riskTenthRefusal, type CapitalRuleRefusal } from "@/lib/risk/gannCapital";
import { gannRiskCapital, readWinningRun } from "@/lib/risk/dynamic-risk";
import { readProfitCeiling } from "@/lib/risk/profitPeak";

/**
 * The paper trading unit the tenth reads (A-RISK-04): from the win history
 * when it is readable, else the starting capital or the equity, whichever is
 * less, as Guided reads it.
 */
export function paperTradingUnit(
  equity: number,
  run: { consecutiveWins: number; streakProfitUsd: number } | null,
): number {
  const e = Math.max(equity, 0);
  return run ? gannRiskCapital({ equity: e, startingCapital: STARTING_CASH, ...run }).capital : Math.min(e, STARTING_CASH);
}

export async function restingEntryRefusal(
  supabase: SupabaseClient,
  userId: string,
  order: { symbol: string; side: "buy" | "sell"; qty: number; stop: number | null; price: number },
): Promise<CapitalRuleRefusal | null> {
  const symbol = order.symbol.toUpperCase();
  if (isOption(symbol)) return null;
  const open = await listOpenPositions(supabase, userId);
  const held = open.find((p) => p.symbol.toUpperCase() === symbol);
  if (isProtectiveOrder(held?.side ?? null, order.side, order.qty, held?.qty ?? 0)) return null;

  const account = await getOrCreateAccount(supabase, userId);
  // A short is owed back, so it counts against the account (paperEquity).
  const equity = Math.max(
    paperEquity(account.cash, open.map((p) => ({ side: p.side, qty: p.qty, price: p.avg_entry_price }))),
    0,
  );

  const capital = capitalRuleRefusal({
    capital: equity,
    symbol,
    price: order.price,
    qty: order.qty,
    open: open
      .filter((p) => p.asset_class !== "option")
      .map((p) => ({ symbol: p.symbol, qty: p.qty, price: p.avg_entry_price })),
  });
  if (capital) return capital;

  if (order.stop == null || !(order.price > 0)) return null;
  const run = await readWinningRun(supabase, userId);
  const ceiling = await readProfitCeiling(supabase, userId, "paper", equity);
  return riskTenthRefusal({
    capital: paperTradingUnit(equity, run),
    symbol,
    entry: order.price,
    stop: order.stop,
    qty: order.qty,
    profitCeiling: ceiling,
  });
}

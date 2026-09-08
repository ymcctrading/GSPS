/**
 * Attaching protocol levels to a position that's already open.
 * -----------------------------------------------------------------------------
 * `lib/trade/place-order.ts`'s `attachLevels` only ever runs at order
 * submission — a stop/take-profit can be staged for a brand-new entry, but a
 * position opened without them (a plain market order, a Guided Decision Mode
 * fill that had no levels to attach, a partial legacy position) has no way to
 * get protected after the fact. This is that path: same staged-exit machinery
 * (`planProtocolExit`, `protocol_exits`, the exit-manager pollers in
 * `lib/trade/exit-manager-sim.ts`), applied to a position instead of an order.
 *
 * Equity-only and paper-only, mirroring `attachLevels`'s own scope (options
 * carry no staged-exit plan; live trading's exits are a separate, narrower
 * path — see `lib/trade/exit-manager.ts`'s header). One working plan per
 * symbol at a time: attaching again while a plan is already working is
 * refused rather than silently replacing it, since replacing would mean
 * reconciling whatever tranches already filled.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getOpenPosition, quotePrice, assetClassOf, isOption as isOptionSymbol } from "@/lib/brokers/simulator";
import { checkBracket } from "@/lib/trade/bracket";
import { planProtocolExit } from "@/lib/trade/protocol-exit";
import { validateLimitPrice, type RoundingMode } from "@/lib/trade/tick-size";

export interface AttachProtocolExitInput {
  symbol: string;
  stopLoss: number;
  takeProfit: number;
  masterProfit?: number;
}

export interface AttachProtocolExitResult {
  status: number;
  body: Record<string, unknown>;
}

export async function attachProtocolExit(
  supabase: SupabaseClient,
  userId: string,
  input: AttachProtocolExitInput,
): Promise<AttachProtocolExitResult> {
  const symbol = input.symbol.toUpperCase();

  if (isOptionSymbol(symbol)) {
    return {
      status: 422,
      body: { error: "Protocol levels can only be attached to an equity position, not an option contract." },
    };
  }

  const position = await getOpenPosition(supabase, userId, symbol);
  if (!position) {
    return { status: 404, body: { error: `No open position in ${symbol} to protect.` } };
  }

  const { data: existing } = await supabase
    .from("protocol_exits")
    .select("id")
    .eq("user_id", userId)
    .eq("symbol", symbol)
    .eq("mode", "paper")
    .eq("status", "working")
    .limit(1)
    .maybeSingle();
  if (existing) {
    return {
      status: 409,
      body: { error: `${symbol} already has a working staged exit. Close the position to clear it before attaching new levels.` },
    };
  }

  const price = await quotePrice(symbol, assetClassOf(symbol));
  if (price == null) {
    return { status: 422, body: { error: `No live price available for ${symbol} right now — try again in a moment.` } };
  }

  // Mirrors place-order.ts's bracket validation: the entry side here is the
  // side that opened the position (long came from a buy, short from a sell),
  // and the reference price is the current market rather than a submitted
  // limit, since this position is already open.
  const entrySide = position.side === "long" ? "buy" : "sell";
  const closingSide = position.side === "long" ? "sell" : "buy";
  const stopMode: RoundingMode = position.side === "long" ? "down" : "up";
  const targetMode: RoundingMode = position.side === "long" ? "up" : "down";

  const equity = { assetType: "EQUITY" as const };
  const stop = validateLimitPrice({ price: input.stopLoss, side: closingSide, instrument: equity, mode: stopMode });
  const target = validateLimitPrice({ price: input.takeProfit, side: closingSide, instrument: equity, mode: targetMode });
  if (!stop.ok || stop.price == null || !target.ok || target.price == null) {
    return {
      status: 422,
      body: { error: "The stop or target can't be expressed at a price this instrument accepts." },
    };
  }

  const check = checkBracket({ side: entrySide, basePrice: price, stopLoss: stop.price, takeProfit: target.price });
  if (!check.ok) {
    return { status: 422, body: { error: check.reason } };
  }

  const exitPlan = planProtocolExit(position.qty, {
    stopLoss: stop.price,
    takeProfit1: target.price,
    masterProfit: input.masterProfit ?? null,
  });

  const { data: plan, error } = await supabase
    .from("protocol_exits")
    .insert({
      user_id: userId,
      symbol,
      side: position.side,
      mode: "paper",
      qty: position.qty,
      entry_price: position.avg_entry_price,
      entry_order_id: null,
      stop_loss: stop.price,
      take_profit_1: target.price,
      master_profit: input.masterProfit ?? null,
      scale_out_qty: exitPlan.scaleOutQty,
      master_qty: exitPlan.masterQty,
      runner_qty: exitPlan.runnerQty,
      exits_attached_at: new Date().toISOString(),
      applied_stop: stop.price,
      applied_stop_reason: "protocol",
    })
    .select("id")
    .single();
  if (error || !plan?.id) {
    return { status: 502, body: { error: `Couldn't save the staged exit — ${error?.message ?? "unknown error"}.` } };
  }

  // Mirrored onto `positions` too, purely for display — the exit-manager
  // poll reads `protocol_exits`, not these columns.
  await supabase
    .from("positions")
    .update({ stop_loss: stop.price, take_profit: target.price, master_profit: input.masterProfit ?? null })
    .eq("id", position.id);

  return {
    status: 200,
    body: {
      ok: true,
      planId: plan.id,
      exitPlan: { summary: exitPlan.summary, splittable: exitPlan.splittable, tranches: exitPlan.tranches },
    },
  };
}

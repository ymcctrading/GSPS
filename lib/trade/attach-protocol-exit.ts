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

export interface UpdateProtocolExitInput {
  symbol: string;
  /** Any subset — a field left out keeps that level unchanged. */
  stopLoss?: number;
  takeProfit1?: number;
  masterProfit?: number | null;
}

/**
 * Manual increase/decrease of a working staged exit's stop-loss, TP1, and/or
 * master-profit levels, for a position already protected via
 * `attachProtocolExit` above.
 * -----------------------------------------------------------------------------
 * TP1 and master profit can move either direction — the user is retargeting,
 * not touching risk already taken. The stop-loss is different: per project
 * direction, it can only be *tightened*, and only once the position is
 * already in profit. Concretely:
 *
 *   - Refused outright while the position isn't in profit yet (current price
 *     hasn't crossed the entry in the favorable direction) — moving a stop
 *     before there's any cushion is exactly the risk-loosening the live-only
 *     `lib/risk/stop-override.ts` high-friction path exists to gate; this
 *     paper-only edit path doesn't carry that friction, so it simply refuses
 *     rather than allow an equivalent loosening informally.
 *   - Once in profit, the new stop must move in the risk-reducing direction
 *     only: up (toward/through entry) for a long, down for a short. A request
 *     that would loosen the stop — even one that's still technically on the
 *     correct side of entry — is refused with the same reasoning.
 *
 * This mirrors `attachProtocolExit`'s validation (bracket/tick checks) but
 * against the *existing* working plan rather than requiring none exist.
 */
export async function updateProtocolExit(
  supabase: SupabaseClient,
  userId: string,
  input: UpdateProtocolExitInput,
): Promise<AttachProtocolExitResult> {
  const symbol = input.symbol.toUpperCase();

  if (input.stopLoss == null && input.takeProfit1 == null && input.masterProfit === undefined) {
    return { status: 400, body: { error: "Nothing to update — pass a new stop loss, TP1, and/or master profit." } };
  }

  const position = await getOpenPosition(supabase, userId, symbol);
  if (!position) {
    return { status: 404, body: { error: `No open position in ${symbol} to edit.` } };
  }

  const { data: existing } = await supabase
    .from("protocol_exits")
    .select("id, stop_loss, take_profit_1, master_profit, qty")
    .eq("user_id", userId)
    .eq("symbol", symbol)
    .eq("mode", "paper")
    .eq("status", "working")
    .limit(1)
    .maybeSingle();
  if (!existing) {
    return {
      status: 404,
      body: { error: `${symbol} has no working staged exit to edit — attach levels first.` },
    };
  }

  const price = await quotePrice(symbol, assetClassOf(symbol));
  if (price == null) {
    return { status: 422, body: { error: `No live price available for ${symbol} right now — try again in a moment.` } };
  }

  const isLong = position.side === "long";
  const entrySide = isLong ? "buy" : "sell";
  const closingSide = isLong ? "sell" : "buy";
  const stopMode: RoundingMode = isLong ? "down" : "up";
  const targetMode: RoundingMode = isLong ? "up" : "down";
  const equity = { assetType: "EQUITY" as const };

  let newStop = existing.stop_loss as number | null;
  if (input.stopLoss != null) {
    const inProfit = isLong ? price > position.avg_entry_price : price < position.avg_entry_price;
    if (!inProfit) {
      return {
        status: 422,
        body: { error: "The stop-loss can only be adjusted once the trade is in profit." },
      };
    }
    const currentStop = existing.stop_loss as number | null;
    if (currentStop != null) {
      const tightened = isLong ? input.stopLoss >= currentStop : input.stopLoss <= currentStop;
      if (!tightened) {
        return {
          status: 422,
          body: {
            error: isLong
              ? "The stop-loss can only be moved up (toward or past entry), never back down — that would loosen risk already reduced."
              : "The stop-loss can only be moved down (toward or past entry), never back up — that would loosen risk already reduced.",
          },
        };
      }
    }
    const validated = validateLimitPrice({ price: input.stopLoss, side: closingSide, instrument: equity, mode: stopMode });
    if (!validated.ok || validated.price == null) {
      return { status: 422, body: { error: "The stop can't be expressed at a price this instrument accepts." } };
    }
    newStop = validated.price;
  }

  let newTarget = existing.take_profit_1 as number;
  if (input.takeProfit1 != null) {
    const validated = validateLimitPrice({ price: input.takeProfit1, side: closingSide, instrument: equity, mode: targetMode });
    if (!validated.ok || validated.price == null) {
      return { status: 422, body: { error: "TP1 can't be expressed at a price this instrument accepts." } };
    }
    newTarget = validated.price;
  }

  let newMaster: number | null = existing.master_profit as number | null;
  if (input.masterProfit !== undefined) {
    if (input.masterProfit == null) {
      newMaster = null;
    } else {
      const validated = validateLimitPrice({ price: input.masterProfit, side: closingSide, instrument: equity, mode: targetMode });
      if (!validated.ok || validated.price == null) {
        return { status: 422, body: { error: "Master profit can't be expressed at a price this instrument accepts." } };
      }
      newMaster = validated.price;
    }
  }

  if (newStop != null) {
    const check = checkBracket({ side: entrySide, basePrice: price, stopLoss: newStop, takeProfit: newTarget });
    if (!check.ok) {
      return { status: 422, body: { error: check.reason } };
    }
  }
  if (newMaster != null) {
    const masterPastTp1 = isLong ? newMaster > newTarget : newMaster < newTarget;
    if (!masterPastTp1) {
      return {
        status: 422,
        body: { error: "Master profit has to sit beyond TP1 in the trade's favor, not before it." },
      };
    }
  }

  const exitPlan = planProtocolExit(existing.qty, {
    stopLoss: newStop ?? position.avg_entry_price,
    takeProfit1: newTarget,
    masterProfit: newMaster,
  });

  const { error } = await supabase
    .from("protocol_exits")
    .update({
      stop_loss: newStop,
      take_profit_1: newTarget,
      master_profit: newMaster,
      scale_out_qty: exitPlan.scaleOutQty,
      master_qty: exitPlan.masterQty,
      runner_qty: exitPlan.runnerQty,
      applied_stop: newStop,
      applied_stop_reason: input.stopLoss != null ? "manual" : undefined,
    })
    .eq("id", existing.id);
  if (error) {
    return { status: 502, body: { error: `Couldn't save the updated levels — ${error.message}.` } };
  }

  await supabase
    .from("positions")
    .update({ stop_loss: newStop, take_profit: newTarget, master_profit: newMaster })
    .eq("id", position.id);

  return {
    status: 200,
    body: {
      ok: true,
      planId: existing.id,
      exitPlan: { summary: exitPlan.summary, splittable: exitPlan.splittable, tranches: exitPlan.tranches },
    },
  };
}

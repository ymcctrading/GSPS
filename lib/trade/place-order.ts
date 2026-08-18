/**
 * Placing a simulated order — the whole path, in one callable function.
 *
 * This used to be the body of `POST /api/orders`. Guided Decision Mode needs to
 * submit through *exactly* the same path the manual ticket does — same price
 * validation, same bracket checks, same staged protocol exit, same ledger rows,
 * same learning telemetry — and the only ways to reuse a route handler are to
 * call it over HTTP from inside the same process, or to copy it. The first is
 * fragile and the second guarantees the two paths drift, which for an order
 * path means the guided flow quietly stops attaching stops.
 *
 * So the logic moved here and both callers are thin. The route keeps the HTTP
 * shape (parse, status codes); this owns what actually happens to the money.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  assetClassOf,
  executeFill,
  isMarketable,
  logPlainClose,
  quoteOptionPrice,
  quotePrice,
} from "@/lib/brokers/simulator";
import { checkBracket } from "@/lib/trade/bracket";
import { planProtocolExit } from "@/lib/trade/protocol-exit";
import { validateLimitPrice, type RoundingMode } from "@/lib/trade/tick-size";
import { killSwitchRefusal } from "@/lib/trade/kill-switch";
import { recordOrderExecution, type RecordExecutionOptions } from "@/lib/learning/record";

type RecordedOrderType = RecordExecutionOptions["orderType"];

export const OrderSchema = z.object({
  // Equity tickers are short; OCC option symbols run ~15–21 chars (e.g. TSM250815C00120000).
  symbol: z.string().min(1).max(24),
  assetClass: z.enum(["equity", "option"]).default("equity"),
  side: z.enum(["buy", "sell"]),
  qty: z.number().int().positive().max(100000),
  entryMode: z.enum(["advised", "now"]).optional(),
  limitPrice: z.number().positive().optional(),
  attachLevels: z
    .object({
      stopLoss: z.number().positive(),
      takeProfit: z.number().positive(),
      masterProfit: z.number().positive().optional(),
    })
    .optional(),
  mode: z.enum(["paper", "live"]).default("paper"),
  /**
   * How a limit price that falls between two valid increments should be
   * snapped. Omitted means conservative-by-side: a buy rounds down so the user
   * never pays more than they asked, a sell rounds up so they never receive
   * less. See lib/trade/tick-size.ts.
   */
  rounding: z.enum(["down", "nearest", "up"]).optional(),
  /**
   * Last price the ticket showed. Used only to validate a bracket on a market
   * entry, where there is no limit price to check the legs against.
   */
  referencePrice: z.number().positive().optional(),
  /**
   * Contract economics + greeks captured at ticket time. Stored as a snapshot so
   * the history grid shows what the trade was opened against, not what today's
   * IV would imply.
   */
  optionDetail: z
    .object({
      strike: z.number().positive(),
      type: z.enum(["call", "put"]),
      expiration: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      premium: z.number().nullable().optional(),
      contractCost: z.number().nullable().optional(),
      delta: z.number().nullable().optional(),
      gamma: z.number().nullable().optional(),
      theta: z.number().nullable().optional(),
      vega: z.number().nullable().optional(),
    })
    .optional(),
});

export type OrderInput = z.infer<typeof OrderSchema>;

/** What the caller returns to the client: an HTTP status and a JSON body. */
export interface PlacedOrder {
  status: number;
  body: Record<string, unknown>;
  /** The ledger row id, when one was written and the order was accepted. */
  orderId?: string | null;
}

export async function placeSimulatedOrder(
  supabase: SupabaseClient,
  userId: string,
  input: OrderInput,
): Promise<PlacedOrder> {
  // Refuse before anything is written or priced.
  // The simulator fills synchronously, so there is no "accepted but not yet
  // executed" state to unwind — a halt has to happen ahead of the fill, not
  // around it.
  const halted = killSwitchRefusal();
  if (halted) return { status: 503, body: { ...halted } };

  if (input.mode === "live") {
    return { status: 400, body: { error: "Live trading requires a connected live brokerage in Settings." } };
  }
  const isOption = input.assetClass === "option";
  // Equity advised entries route as limits at the protocol price. Options carry
  // no advised limit (the ticket doesn't price the premium), so they go market
  // unless the user supplied an explicit limit.
  if (!isOption && input.entryMode === "advised" && !input.limitPrice) {
    return { status: 400, body: { error: "Advised-price orders need a limitPrice" } };
  }

  // ---- Price-increment validation -----------------------------------------
  // A price between two valid increments is refused by the broker with
  // `sub-penny increment does not fulfill minimum pricing criteria`, and until
  // now that rejection happened after the user had already committed. Snap the
  // price to the instrument's increment here, and refuse to submit at all when
  // it can't be made valid. `priceCheck` rides back on the response so the
  // ticket can show what was corrected and why.
  let submittedLimitPrice = input.limitPrice;
  let priceCheck: ReturnType<typeof validateLimitPrice> | null = null;
  if (input.limitPrice != null) {
    priceCheck = validateLimitPrice({
      price: input.limitPrice,
      side: input.side,
      instrument: { assetType: isOption ? "OPTION" : "EQUITY" },
      mode: input.rounding as RoundingMode | undefined,
    });
    if (!priceCheck.ok || priceCheck.price == null) {
      return { status: 422, body: {
          error: priceCheck.blockedReason ?? "This limit price can't be used for this instrument.",
          code: "invalid_price_increment",
          priceCheck,
        } };
    }
    submittedLimitPrice = priceCheck.price;
  }

  // Equity entries only — options carry no staged-exit plan. Unlike a real
  // broker, this is our own simulator: nothing here calls out to Alpaca, so
  // the "no bracket on a short leg" limitation a live Alpaca account would
  // hit doesn't apply — a short's exit is staged and managed the same way a
  // long's is, via lib/trade/exit-manager-sim.ts, on both sides.
  const useBracket = !isOption && !!input.attachLevels;
  const orderType = submittedLimitPrice ? "limit" : "market";

  // The bracket legs are prices too, and they reach the broker the same way the
  // entry does — `String(stopLoss)`. They are computed by arithmetic on bar
  // prices, so they carry the same float dirt (`483.51 - 0.01`), and validating
  // only the entry left two thirds of the order able to draw the rejection this
  // is meant to prevent. Each leg is snapped on the side that keeps it where the
  // protocol intended: never tighter than asked for. On a long the stop sits
  // below entry (round down) and the target above (round up); a short is the
  // mirror image.
  let bracketLevels: { stopLoss: number; takeProfit: number } | undefined;
  if (useBracket) {
    const equity = { assetType: "EQUITY" as const };
    const closingSide = input.side === "buy" ? "sell" : "buy";
    const stopMode: RoundingMode = input.side === "buy" ? "down" : "up";
    const targetMode: RoundingMode = input.side === "buy" ? "up" : "down";
    const stop = validateLimitPrice({
      price: input.attachLevels!.stopLoss,
      side: closingSide,
      instrument: equity,
      mode: stopMode,
    });
    const target = validateLimitPrice({
      price: input.attachLevels!.takeProfit,
      side: closingSide,
      instrument: equity,
      mode: targetMode,
    });
    if (!stop.ok || stop.price == null || !target.ok || target.price == null) {
      return { status: 422, body: {
          error:
            "The stop or target can't be expressed at a price this instrument accepts. Uncheck protocol levels (or clear the custom stop/target) and manage them yourself.",
          code: "invalid_price_increment",
        } };
    }
    bracketLevels = { stopLoss: stop.price, takeProfit: target.price };
  }

  // A stop/target has to sit on the correct side of the entry (by at least a
  // cent) or the staged exit can never trigger sanely. Protocol levels are
  // computed against the advised entry, so a market entry on the other side of
  // that price can produce legs on the wrong side — catch it here with wording
  // that says what to do about it.
  if (useBracket) {
    const basePrice = submittedLimitPrice ?? input.referencePrice ?? 0;
    const check = checkBracket({
      side: input.side,
      basePrice,
      stopLoss: bracketLevels!.stopLoss,
      takeProfit: bracketLevels!.takeProfit,
    });
    if (!check.ok) {
      return { status: 422, body: {
          error: `${check.reason} Place the order at the advised price instead, or uncheck the protocol levels and manage the stop yourself.`,
          code: "invalid_bracket",
        } };
    }
  }

  // Everything about the row that doesn't depend on whether the broker took
  // the order. Built once so the rejection path records exactly the same order
  // the acceptance path would have.
  const ledgerRow = {
    user_id: userId,
    mode: "paper" as const,
    symbol: input.symbol.toUpperCase(),
    asset_class: isOption ? "option" : "us_equity",
    side: input.side,
    order_type: useBracket ? "bracket" : !isOption && input.entryMode === "advised" ? "limit" : orderType,
    qty: input.qty,
    limit_price: submittedLimitPrice ?? null,
    requested_limit_price: input.limitPrice ?? null,
    tick_size: priceCheck?.tick?.size ?? null,
    tick_source: priceCheck?.tick?.source ?? null,
    stop_price: bracketLevels?.stopLoss ?? null,
    take_profit: bracketLevels?.takeProfit ?? null,
    master_profit: useBracket ? input.attachLevels!.masterProfit ?? null : null,
    // Option economics + greeks snapshot (null on equity orders).
    purchase_price: input.optionDetail?.premium ?? submittedLimitPrice ?? null,
    contract_cost: input.optionDetail?.contractCost ?? null,
    option_type: input.optionDetail?.type ?? null,
    strike: input.optionDetail?.strike ?? null,
    expiration: input.optionDetail?.expiration ?? null,
    delta: input.optionDetail?.delta ?? null,
    gamma: input.optionDetail?.gamma ?? null,
    theta: input.optionDetail?.theta ?? null,
    vega: input.optionDetail?.vega ?? null,
  };

  // What the protocol will do on the way out, for the ticket's confirmation.
  // The split is recomputed from the quantity actually filled when the exits are
  // attached, so this is the plan for the order as asked for.
  const exitPlan = useBracket
    ? planProtocolExit(input.qty, {
        stopLoss: bracketLevels!.stopLoss,
        takeProfit1: bracketLevels!.takeProfit,
        masterProfit: input.attachLevels!.masterProfit ?? null,
      })
    : null;

  const submittedAt = Date.now();
  try {
    // Simulated fill (see lib/brokers/simulator.ts): a market order, or a
    // limit that's already marketable, fills right here, synchronously. An
    // option limit order fills at the price the user asked for, same as
    // equities; an option market order tries a live per-contract quote first
    // and falls back to the premium the ticket already knew only when no live
    // quote is available (no options market-data subscription, or the
    // contract hasn't traded recently). Anything that doesn't fill rests as a
    // `new` order, picked up by `evaluateRestingOrders` on the next poll once
    // the market reaches it.
    const fillAssetClass = assetClassOf(input.symbol);
    let fillPrice: number | null = null;
    let filled = false;

    if (isOption) {
      fillPrice = submittedLimitPrice ?? (await quoteOptionPrice(input.symbol)) ?? input.optionDetail?.premium ?? null;
      if (fillPrice == null) {
        throw new Error("No price available to fill this option order — refresh the chain and try again.");
      }
      filled = true;
    } else if (orderType === "market") {
      fillPrice = await quotePrice(input.symbol, fillAssetClass);
      if (fillPrice == null) {
        throw new Error(`No live price available for ${input.symbol} right now — the order wasn't placed.`);
      }
      filled = true;
    } else {
      const market = await quotePrice(input.symbol, fillAssetClass);
      if (market != null && isMarketable(input.side, submittedLimitPrice!, market)) {
        // Marketable means the live price is already at least as good as the
        // limit (a buy limit's market is <= it, a sell limit's is >=) — a real
        // broker fills at that better price, not at the stale limit typed into
        // the ticket. Filling at `submittedLimitPrice` here previously meant an
        // "advised price" short placed while the market had already rallied
        // past its entry filled instantly at the stale, worse entry instead of
        // the price actually on offer — a same-second paper loss with no fill
        // ever tested against the market.
        fillPrice = market;
        filled = true;
      }
      // Not marketable yet (or no quote this instant) — rests as `new` and is
      // picked up by evaluateRestingOrders once the market reaches it.
    }

    const { data: inserted, error: dbError } = await supabase
      .from("orders")
      .insert({
        ...ledgerRow,
        status: filled ? "filled" : "new",
        filled_qty: filled ? input.qty : null,
        filled_avg_price: filled ? fillPrice : null,
        broker_submitted_at: new Date().toISOString(),
        last_synced_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (dbError) throw new Error(`Order couldn't be recorded — ${dbError.message}`);
    const orderId = (inserted as { id?: string } | null)?.id ?? null;

    let planError: string | null = null;
    if (filled) {
      const executed = await executeFill(supabase, userId, {
        symbol: input.symbol,
        assetClass: fillAssetClass,
        side: input.side,
        qty: input.qty,
        price: fillPrice!,
      });

      // A plain sell placed through the ticket (not the dedicated "Close
      // position" action) can still close or reduce an existing position —
      // nothing else will log that trade, so it's logged right here.
      if (executed.closed) {
        await logPlainClose(supabase, userId, input.symbol, fillAssetClass, input.side, executed.closed);
      }

      // The plan carries the exit rules from here on. The entry already
      // filled (synchronously, above), so the split is against the real
      // quantity bought — no "wait for the entry to stop filling" step is
      // needed, unlike the real broker's asynchronous fills.
      if (exitPlan && bracketLevels) {
        const { data: plan, error } = await supabase
          .from("protocol_exits")
          .insert({
            user_id: userId,
            symbol: input.symbol.toUpperCase(),
            side: input.side === "buy" ? "long" : "short",
            mode: "paper",
            qty: input.qty,
            entry_price: fillPrice,
            entry_order_id: orderId,
            stop_loss: bracketLevels.stopLoss,
            take_profit_1: bracketLevels.takeProfit,
            master_profit: input.attachLevels!.masterProfit ?? null,
            scale_out_qty: exitPlan.scaleOutQty,
            master_qty: exitPlan.masterQty,
            runner_qty: exitPlan.runnerQty,
            exits_attached_at: new Date().toISOString(),
            applied_stop: bracketLevels.stopLoss,
            applied_stop_reason: "protocol",
          })
          .select("id")
          .maybeSingle();
        if (error) {
          console.error(`orders: exit plan for ${ledgerRow.symbol} not recorded — ${error.message}`);
          planError =
            "The order filled, but the staged exit couldn't be saved — TP1 and the master target won't be taken automatically. Close the position by hand if it moves against you.";
        } else if (plan?.id && orderId) {
          await supabase.from("orders").update({ exit_plan_id: plan.id }).eq("id", orderId);
        }
      }
    }

    // What happened to the order is the other half of the data the learning
    // tables need: a verdict with no fill beside it can never be scored
    // against an outcome.
    await recordOrderExecution(userId, {
      orderId: orderId ?? undefined,
      symbol: input.symbol,
      assetClass: isOption ? "option" : "us_equity",
      orderType: (ledgerRow.order_type as RecordedOrderType) ?? "market",
      side: input.side,
      quantity: input.qty,
      requestedPrice: submittedLimitPrice,
      filledPrice: filled ? (fillPrice ?? undefined) : undefined,
      filledQty: filled ? input.qty : undefined,
      brokerStatus: filled ? "filled" : "pending",
      latencyMs: Date.now() - submittedAt,
    });

    return { status: 200, orderId, body: {
      order: { id: orderId, symbol: input.symbol.toUpperCase(), side: input.side, qty: input.qty, status: filled ? "filled" : "new", filled_avg_price: fillPrice, filled_qty: filled ? input.qty : null },
      mirrored: true,
      priceCheck,
      // How this position will be exited, in the ticket's own words.
      exitPlan: exitPlan
        ? { summary: exitPlan.summary, splittable: exitPlan.splittable, tranches: exitPlan.tranches }
        : null,
      warning: planError,
    } };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);

    // Record the rejection. A rejected order still needs a row to be shown,
    // explained and resubmitted from.
    const { data: inserted, error: dbError } = await supabase
      .from("orders")
      .insert({
        ...ledgerRow,
        status: "rejected",
        reject_reason: raw,
        broker_submitted_at: new Date().toISOString(),
        last_synced_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (dbError) {
      console.error(`orders: rejection for ${ledgerRow.symbol} not recorded — ${dbError.message}`);
    }

    await recordOrderExecution(userId, {
      orderId: (inserted as { id?: string } | null)?.id,
      symbol: input.symbol,
      assetClass: isOption ? "option" : "us_equity",
      orderType: (ledgerRow.order_type as RecordedOrderType) ?? "market",
      side: input.side,
      quantity: input.qty,
      requestedPrice: submittedLimitPrice,
      brokerStatus: "rejected",
      brokerErrorMsg: raw,
      latencyMs: Date.now() - submittedAt,
    });

    return { status: 502, body: { error: raw, code: "simulated_order_error", recorded: !dbError } };
  }
}

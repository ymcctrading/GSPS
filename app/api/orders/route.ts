/**
 * GSPS — /api/orders
 * POST: place an order (paper by default; live requires a connected live broker).
 * GET:  list the user's orders (mirrored in Supabase).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  assetClassOf,
  evaluateRestingOrders,
  executeFill,
  isMarketable,
  listOpenPositions,
  logPlainClose,
  quoteOptionPrice,
  quotePrice,
} from "@/lib/brokers/simulator";
import { checkBracket } from "@/lib/trade/bracket";
import { evaluateTargets } from "@/lib/trade/targets";
import { planProtocolExit } from "@/lib/trade/protocol-exit";
import { manageSimulatedExits } from "@/lib/trade/exit-manager-sim";
import { validateLimitPrice, type RoundingMode } from "@/lib/trade/tick-size";
import { killSwitchRefusal } from "@/lib/trade/kill-switch";
import { recordOrderExecution, type RecordExecutionOptions } from "@/lib/learning/record";
import { pruneClosedOrders } from "@/lib/portfolio/prune";
import { parseOccSymbol } from "@/lib/portfolio/occ";

type RecordedOrderType = RecordExecutionOptions["orderType"];

const OrderSchema = z.object({
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

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  // Refuse before anything is written or priced. The simulator fills
  // synchronously, so there is no "accepted but not yet executed" state to
  // unwind — a halt has to happen ahead of the fill, not around it.
  const halted = killSwitchRefusal();
  if (halted) return NextResponse.json(halted, { status: 503 });

  const parsed = OrderSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid order" }, { status: 400 });
  }
  const input = parsed.data;

  if (input.mode === "live") {
    return NextResponse.json(
      { error: "Live trading requires a connected live brokerage in Settings." },
      { status: 400 },
    );
  }
  const isOption = input.assetClass === "option";
  // Equity advised entries route as limits at the protocol price. Options carry
  // no advised limit (the ticket doesn't price the premium), so they go market
  // unless the user supplied an explicit limit.
  if (!isOption && input.entryMode === "advised" && !input.limitPrice) {
    return NextResponse.json({ error: "Advised-price orders need a limitPrice" }, { status: 400 });
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
      return NextResponse.json(
        {
          error: priceCheck.blockedReason ?? "This limit price can't be used for this instrument.",
          code: "invalid_price_increment",
          priceCheck,
        },
        { status: 422 },
      );
    }
    submittedLimitPrice = priceCheck.price;
  }

  // Brackets only apply to long equity entries (both legs, buy side, on Alpaca).
  const useBracket = !isOption && !!input.attachLevels && input.side === "buy";
  const orderType = submittedLimitPrice ? "limit" : "market";

  // The bracket legs are prices too, and they reach the broker the same way the
  // entry does — `String(stopLoss)`. They are computed by arithmetic on bar
  // prices, so they carry the same float dirt (`483.51 - 0.01`), and validating
  // only the entry left two thirds of the order able to draw the rejection this
  // is meant to prevent. Each leg is snapped on the side that keeps it where the
  // protocol intended: a stop rounds down (further from the entry, never tighter
  // than asked for) and a target rounds up.
  let bracketLevels: { stopLoss: number; takeProfit: number } | undefined;
  if (useBracket) {
    const equity = { assetType: "EQUITY" as const };
    const stop = validateLimitPrice({
      price: input.attachLevels!.stopLoss,
      side: "sell",
      instrument: equity,
      mode: "down",
    });
    const target = validateLimitPrice({
      price: input.attachLevels!.takeProfit,
      side: "sell",
      instrument: equity,
      mode: "up",
    });
    if (!stop.ok || stop.price == null || !target.ok || target.price == null) {
      return NextResponse.json(
        {
          error:
            "The protocol stop or target can't be expressed at a price this instrument accepts. Uncheck the protocol levels and manage them yourself.",
          code: "invalid_price_increment",
        },
        { status: 422 },
      );
    }
    bracketLevels = { stopLoss: stop.price, takeProfit: target.price };
  }

  // Alpaca requires the stop below and the target above the entry (by at least
  // a cent). The protocol computes its levels against the advised entry, so a
  // market entry on the other side of that price produces legs the broker will
  // refuse — catch it here with wording that says what to do about it.
  if (useBracket) {
    const basePrice = submittedLimitPrice ?? input.referencePrice ?? 0;
    const check = checkBracket({
      side: input.side,
      basePrice,
      stopLoss: bracketLevels!.stopLoss,
      takeProfit: bracketLevels!.takeProfit,
    });
    if (!check.ok) {
      return NextResponse.json(
        {
          error: `${check.reason} Place the order at the advised price instead, or uncheck the protocol levels and manage the stop yourself.`,
          code: "invalid_bracket",
        },
        { status: 422 },
      );
    }
  }

  // Everything about the row that doesn't depend on whether the broker took
  // the order. Built once so the rejection path records exactly the same order
  // the acceptance path would have.
  const ledgerRow = {
    user_id: user.id,
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
      const executed = await executeFill(supabase, user.id, {
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
        await logPlainClose(supabase, user.id, input.symbol, fillAssetClass, input.side, executed.closed);
      }

      // The plan carries the exit rules from here on. The entry already
      // filled (synchronously, above), so the split is against the real
      // quantity bought — no "wait for the entry to stop filling" step is
      // needed, unlike the real broker's asynchronous fills.
      if (exitPlan && bracketLevels) {
        const { data: plan, error } = await supabase
          .from("protocol_exits")
          .insert({
            user_id: user.id,
            symbol: input.symbol.toUpperCase(),
            side: "long",
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
    await recordOrderExecution(user.id, {
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

    return NextResponse.json({
      order: { id: orderId, symbol: input.symbol.toUpperCase(), side: input.side, qty: input.qty, status: filled ? "filled" : "new", filled_avg_price: fillPrice, filled_qty: filled ? input.qty : null },
      mirrored: true,
      priceCheck,
      // How this position will be exited, in the ticket's own words.
      exitPlan: exitPlan
        ? { summary: exitPlan.summary, splittable: exitPlan.splittable, tranches: exitPlan.tranches }
        : null,
      warning: planError,
    });
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

    await recordOrderExecution(user.id, {
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

    return NextResponse.json(
      { error: raw, code: "simulated_order_error", recorded: !dbError },
      { status: 502 },
    );
  }
}


/**
 * List the user's orders, with resting simulated limit orders evaluated
 * against live prices and the staged protocol exits advanced.
 *
 * Paper trading has no external broker to reconcile against — this app's own
 * `orders`/`positions` tables are the only ledger there is (see
 * lib/brokers/simulator.ts), so what used to be a broker-sync pass is now
 * just "did any resting order cross its price" and "did any exit plan's
 * levels get touched", both evaluated directly against the live feed.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  // Fill whatever resting limit orders the market has now reached, before
  // reading the ledger back — otherwise the response is a snapshot taken one
  // moment before the rows in it became true.
  const restingFill = await evaluateRestingOrders(supabase, user.id).catch(
    (err): { filled: number; error: string | null } => ({
      filled: 0,
      error: err instanceof Error ? err.message : String(err),
    }),
  );
  if (restingFill.error) console.error(`orders: resting-order evaluation — ${restingFill.error}`);

  // Advancing the staged exits here is what makes the trailing stop and the
  // master-target reversal real: both depend on where price has *been*, so
  // they can only move forward when something samples the market. The
  // Portfolio page polls this endpoint, which is where the sampling happens.
  const exits = await manageSimulatedExits(supabase, user.id).catch(
    (err): { managed: number; filled: number; closed: number; notes: string[]; error: string | null } => ({
      managed: 0,
      filled: 0,
      closed: 0,
      notes: [],
      error: err instanceof Error ? err.message : String(err),
    }),
  );
  if (exits.error) console.error(`orders: exit management — ${exits.error}`);

  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let orders = (data ?? []) as Record<string, unknown>[];

  // A closed order — filled, no longer held, untouched for 24+ hours — has
  // nothing left to show, so it's deleted rather than kept growing the ledger.
  const heldSymbols = new Set((await listOpenPositions(supabase, user.id)).map((p) => p.symbol.toUpperCase()));
  const prune = await pruneClosedOrders(supabase, user.id, heldSymbols).catch(
    (err): { deleted: number; error: string | null; staleIds: string[] } => ({
      deleted: 0,
      error: err instanceof Error ? err.message : String(err),
      staleIds: [],
    }),
  );
  if (prune.error) {
    console.error(`orders: closed-order prune — ${prune.error}`);
  } else if (prune.staleIds.length > 0) {
    const pruned = new Set(prune.staleIds);
    orders = orders.filter((o) => !pruned.has(String(o.id)));
  }

  // One quote per unique equity/crypto symbol on the page — bounded to what's
  // actually shown, not a market-wide call. Options have no live per-contract
  // feed (see lib/brokers/simulator.ts), so they carry no live mark here.
  const symbols = [...new Set(orders.map((o) => String(o.symbol).toUpperCase()))].filter((s) => !parseOccSymbol(s));
  const quoteEntries = await Promise.all(
    symbols.map(async (s) => [s, await quotePrice(s, assetClassOf(s))] as const),
  );
  const quotes = new Map(quoteEntries);

  const enriched = orders.map((o) => {
    const currentPrice = quotes.get(String(o.symbol).toUpperCase()) ?? null;
    const side = o.side === "sell" ? "sell" : "buy";
    const levels = {
      tp1: numOrNull(o.take_profit),
      mp: numOrNull(o.master_profit),
      sl: numOrNull(o.stop_price),
    };
    return {
      ...o,
      currentPrice,
      // Not modeled: an accurate day P/L needs the symbol's previous session
      // close, which isn't fetched here.
      dayPl: null,
      dayPlPct: null,
      targets: evaluateTargets(side, levels, currentPrice, {
        tp1At: o.tp1_hit_at as string | null,
        mpAt: o.mp_hit_at as string | null,
        slAt: o.sl_hit_at as string | null,
      }),
    };
  });

  return NextResponse.json({
    orders: enriched,
    sync: {
      syncedAt: new Date().toISOString(),
      syncError: restingFill.error,
      reconciled: restingFill.filled,
      orphaned: 0,
      source: "simulated-paper",
    },
    // What the staged exits did on this pass. Reported rather than silent: a
    // stop that moved is a change to the user's risk, and one that couldn't
    // be moved is something they need to know about while they can still act.
    exits: {
      managed: exits.managed,
      attached: exits.filled,
      adjusted: 0,
      closed: exits.closed,
      notes: exits.notes,
      error: exits.error,
    },
  });
}

function numOrNull(v: unknown): number | null {
  const n = Number(v);
  return v == null || Number.isNaN(n) ? null : n;
}


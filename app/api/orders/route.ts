/**
 * GSPS — /api/orders
 * POST: place an order (paper by default; live requires a connected live broker).
 * GET:  list the user's orders (mirrored in Supabase).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  envCreds,
  getPositions,
  listOrders,
  placeOrder,
  type AlpacaCreds,
  type AlpacaPosition,
} from "@/lib/brokers/alpaca";
import { checkBracket } from "@/lib/trade/bracket";
import { evaluateTargets } from "@/lib/trade/targets";
import { planProtocolExit } from "@/lib/trade/protocol-exit";
import { manageProtocolExits } from "@/lib/trade/exit-manager";
import { validateLimitPrice, type RoundingMode } from "@/lib/trade/tick-size";
import {
  isWorking,
  normalizeOrderStatus,
  reconcileOrders,
  type BrokerOrder,
  type LocalOrder,
} from "@/lib/portfolio/order-status";
import {
  brokerStatusFrom,
  numericOrUndefined,
  recordOrderExecution,
  type RecordExecutionOptions,
} from "@/lib/learning/record";

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

  const creds = envCreds("paper");
  if (!creds) {
    return NextResponse.json(
      { error: "Paper trading is not configured (missing Alpaca API keys)." },
      { status: 503 },
    );
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
    // Real order (equity or option) — options carry a real Alpaca OCC symbol
    // from /api/options/chain, not a fabricated one.
    //
    // Protocol entries attach the stop and nothing else. The stop is the leg
    // that has to exist from the first tick — it is what caps the loss — and it
    // can be attached atomically because it applies to the whole position. The
    // profit tranches can't: they are three sell orders, and three bracketed
    // buys draw a wash-trade rejection on the second one. They go on once the
    // shares are held, from `manageProtocolExits`.
    const broker = await placeOrder(creds, {
      symbol: input.symbol,
      side: input.side,
      qty: input.qty,
      type: !isOption && input.entryMode === "advised" ? "limit" : orderType,
      limitPrice: submittedLimitPrice,
      bracket: bracketLevels ? { stopLoss: bracketLevels.stopLoss } : undefined,
    });

    // The plan is what carries the exit rules after this request ends. Written
    // before the ledger row so the row can point at it; a failure here costs
    // the staged exit, which is worth saying out loud rather than silently
    // leaving the position on a bare stop.
    let planId: string | null = null;
    let planError: string | null = null;
    if (exitPlan) {
      const { data: plan, error } = await supabase
        .from("protocol_exits")
        .insert({
          user_id: user.id,
          symbol: input.symbol.toUpperCase(),
          side: "long",
          mode: "paper",
          qty: input.qty,
          // The price the levels were measured against. `checkBracket` has
          // already refused the order if neither exists, and the manage pass
          // replaces it with the broker's average fill once there is one.
          entry_price: submittedLimitPrice ?? input.referencePrice!,
          entry_order_id: broker.id,
          stop_loss: bracketLevels!.stopLoss,
          take_profit_1: bracketLevels!.takeProfit,
          master_profit: input.attachLevels!.masterProfit ?? null,
          scale_out_qty: exitPlan.scaleOutQty,
          master_qty: exitPlan.masterQty,
          runner_qty: exitPlan.runnerQty,
          applied_stop: bracketLevels!.stopLoss,
          applied_stop_reason: "protocol",
        })
        .select("id")
        .maybeSingle();
      if (error) {
        console.error(`orders: exit plan for ${ledgerRow.symbol} not recorded — ${error.message}`);
        planError =
          "The order is placed and its stop is attached, but the staged exit couldn't be saved — TP1 and the master target won't be taken automatically. Manage them at the broker.";
      } else {
        planId = plan?.id ? String(plan.id) : null;
      }
    }

    const { data: inserted, error: dbError } = await supabase
      .from("orders")
      .insert({
        ...ledgerRow,
        exit_plan_id: planId,
        broker_order_id: broker.id,
        status: broker.status ?? "new",
        broker_submitted_at: broker.submitted_at ?? new Date().toISOString(),
        last_synced_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    // What the broker did with a real order is the other half of the data the
    // learning tables need: a verdict with no fill beside it can never be
    // scored against an outcome.
    await recordOrderExecution(user.id, {
      orderId: (inserted as { id?: string } | null)?.id,
      symbol: input.symbol,
      assetClass: isOption ? "option" : "us_equity",
      orderType: (ledgerRow.order_type as RecordedOrderType) ?? "market",
      side: input.side,
      quantity: input.qty,
      requestedPrice: submittedLimitPrice,
      filledPrice: numericOrUndefined(broker.filled_avg_price),
      filledQty: numericOrUndefined(broker.filled_qty),
      brokerStatus: brokerStatusFrom(broker.status),
      latencyMs: Date.now() - submittedAt,
    });

    if (dbError) {
      // The order is live at the broker but absent from our ledger, so it will
      // not appear in the Portfolio. That is a data-loss event, not a cosmetic
      // one — log it with the broker id so it can be reconciled by hand.
      console.error(
        `orders: broker order ${broker.id} placed but not mirrored — ${dbError.message}`,
      );
    }

    return NextResponse.json({
      order: broker,
      mirrored: !dbError,
      priceCheck,
      // How this position will be exited, in the ticket's own words.
      exitPlan: exitPlan
        ? { summary: exitPlan.summary, splittable: exitPlan.splittable, tranches: exitPlan.tranches }
        : null,
      warning: planError,
    });
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    const friendly = explainBrokerError(raw, input.side, isOption);

    // Record the rejection. Previously this path returned without touching the
    // database, so an order the broker refused left no trace anywhere in the
    // app — the user saw a toast, and the order was gone. A rejected order is
    // still something that happened, and it needs a row to be shown, explained
    // and resubmitted from.
    const { data: inserted, error: dbError } = await supabase
      .from("orders")
      .insert({
        ...ledgerRow,
        broker_order_id: null,
        status: "rejected",
        reject_reason: friendly.message,
        broker_submitted_at: new Date().toISOString(),
        last_synced_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (dbError) {
      console.error(`orders: rejection for ${ledgerRow.symbol} not recorded — ${dbError.message}`);
    }

    // A refusal is evidence about the setup that produced it — a stop the broker
    // would not take, a symbol that cannot be shorted. Recording only the orders
    // that were easy to place would leave the table describing the wrong sample.
    await recordOrderExecution(user.id, {
      orderId: (inserted as { id?: string } | null)?.id,
      symbol: input.symbol,
      assetClass: isOption ? "option" : "us_equity",
      orderType: (ledgerRow.order_type as RecordedOrderType) ?? "market",
      side: input.side,
      quantity: input.qty,
      requestedPrice: submittedLimitPrice,
      brokerStatus: "rejected",
      brokerErrorCode: friendly.code,
      brokerErrorMsg: friendly.message,
      latencyMs: Date.now() - submittedAt,
    });

    return NextResponse.json(
      { error: friendly.message, code: friendly.code, raw, recorded: !dbError },
      { status: friendly.status },
    );
  }
}

/**
 * Map opaque Alpaca rejections to actionable guidance.
 *
 * The wording varies by rejection path — the same "can't short this" outcome
 * arrives as `not allowed to short` (account-level) or as
 * `asset "GPUS" cannot be sold short` under the generic 42210000 code
 * (asset-level) — so match on the phrasing rather than one code.
 */
function explainBrokerError(
  raw: string,
  side: "buy" | "sell",
  isOption: boolean,
): { message: string; code: string; status: number } {
  const lower = raw.toLowerCase();
  const shortRejected =
    lower.includes("not allowed to short") ||
    lower.includes("cannot be sold short") ||
    lower.includes("not shortable") ||
    lower.includes("40310000");
  if (shortRejected) {
    return {
      code: "short_not_allowed",
      status: 422,
      message: isOption
        ? "This account can't open that short contract. Buy the opposite side instead."
        : "This symbol can't be sold short — its shares aren't available to borrow. To trade the bearish setup, buy a PUT (switch to Options above) or wait for a long entry.",
    };
  }
  // Bracket legs on the wrong side of the entry. Alpaca reports this as a
  // base_price constraint; the user-facing problem is that the protocol stop no
  // longer fits the price they're actually entering at.
  if (lower.includes("base_price")) {
    const stopLeg = lower.includes("stop_loss") || lower.includes("stop_price");
    return {
      code: "invalid_bracket",
      status: 422,
      message: stopLeg
        ? "The protocol stop sits on the wrong side of the current market price, so the broker rejected the bracket. Switch to the advised entry price, or uncheck the protocol levels and manage the stop manually."
        : "The protocol target sits on the wrong side of the current market price, so the broker rejected the bracket. Switch to the advised entry price, or uncheck the protocol levels and manage the target manually.",
    };
  }
  if (lower.includes("market is closed") || lower.includes("outside of market hours")) {
    return {
      code: "market_closed",
      status: 422,
      message:
        "The market is closed, so this order can't be routed right now. Place it during regular hours, or use a limit order that rests until the open.",
    };
  }
  if (lower.includes("not tradable") || lower.includes("asset is not active")) {
    return {
      code: "not_tradable",
      status: 422,
      message: "This symbol isn't tradable through the connected broker.",
    };
  }
  if (lower.includes("wash trade") || lower.includes("potential wash trade")) {
    return {
      code: "wash_trade",
      status: 422,
      message:
        "The broker blocked this as a potential wash trade — you have an opposing order working on the same symbol. Cancel it first, then retry.",
    };
  }
  if (isOption && (lower.includes("not eligible") || lower.includes("options") && lower.includes("not"))) {
    return {
      code: "options_not_enabled",
      status: 422,
      message:
        "This paper account isn't approved for options yet. Enable options trading on your Alpaca account, then retry.",
    };
  }
  if (lower.includes("insufficient") || lower.includes("buying power")) {
    return {
      code: "insufficient_funds",
      status: 422,
      message: "Not enough buying power in the paper account for this order size.",
    };
  }
  return { code: "broker_error", status: 502, message: humanizeBrokerError(raw) };
}

/**
 * Last resort for a rejection with no known translation. The raw string is an
 * internal URL plus a JSON blob; lift the broker's own `message` out of it so
 * the ticket shows a sentence rather than `Alpaca trading /v2/orders failed
 * (422): {"code":42210000,...}`. The untouched original still rides along in
 * the response's `raw` field for debugging.
 */
function humanizeBrokerError(raw: string): string {
  const jsonStart = raw.indexOf("{");
  if (jsonStart !== -1) {
    try {
      const parsed = JSON.parse(raw.slice(jsonStart)) as { message?: unknown };
      if (typeof parsed.message === "string" && parsed.message.trim()) {
        const detail = parsed.message.trim();
        return `The broker rejected this order: ${detail.charAt(0).toUpperCase()}${detail.slice(1)}`;
      }
    } catch {
      /* not JSON — fall through to the generic sentence */
    }
  }
  return "The broker rejected this order. Check the quantity and price, then try again.";
}

/**
 * List the user's orders, reconciled against the broker and enriched with a
 * live mark for anything still held.
 *
 * Reconciliation runs first, and it is the fix for the Pending panel showing a
 * frozen archive: local rows were written once at submit time and never
 * chased, so an order that filled or was cancelled at the broker still read
 * `new` here forever. `reconcileOrders` diffs the two and writes the broker's
 * answer back before the response is built, so what the page renders is the
 * broker's current state rather than a snapshot of the moment each order was
 * placed.
 *
 * Day P/L comes from the broker's open positions rather than being recomputed
 * here: Alpaca already tracks intraday P/L against the correct prior close for
 * both equities and option contracts. Orders with no matching open position
 * (closed out, or filled away) report null P/L rather than a fabricated zero.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let orders = (data ?? []) as Record<string, unknown>[];
  const sync = await syncWithBroker(supabase, orders);
  if (sync.refreshed) orders = sync.refreshed;

  // One read of the broker's open positions serves both consumers: the live
  // marks below, and the exit manager, which needs to know what is still held
  // to decide whether a plan is running or finished. Null means the read
  // failed — the manager treats that as "don't touch anything" rather than as
  // "everything is flat".
  //
  // An empty ledger costs no broker call at all: a staged exit only exists
  // because an order created it, so with no orders there is nothing to mark and
  // nothing to manage. This endpoint is polled on a ten-second timer, which is
  // why that shortcut is worth keeping.
  const creds = envCreds("paper");
  const active = creds != null && orders.length > 0;
  const positions = active ? await openPositions(creds!) : null;
  const marks = markPrices(positions ?? []);

  // Advancing the staged exits here is what makes the trailing stop and the
  // master-target reversal real: both depend on where price has *been*, so they
  // can only move forward when something samples the market. The Portfolio
  // polls this endpoint, so this is where the sampling happens.
  const exits = active
    ? await manageProtocolExits(supabase, creds!, user.id, positions)
    : {
        managed: 0,
        attached: 0,
        adjusted: 0,
        closed: 0,
        notes: [] as string[],
        error: creds
          ? null
          : "Paper trading isn't configured, so the protocol's exit rules aren't running.",
      };

  const enriched = orders.map((o) => {
    const mark = marks.get(String(o.symbol));
    const side = o.side === "sell" ? "sell" : "buy";
    const levels = {
      tp1: numOrNull(o.take_profit),
      mp: numOrNull(o.master_profit),
      sl: numOrNull(o.stop_price),
    };
    return {
      ...o,
      currentPrice: mark?.currentPrice ?? null,
      dayPl: mark?.dayPl ?? null,
      dayPlPct: mark?.dayPlPct ?? null,
      targets: evaluateTargets(side, levels, mark?.currentPrice ?? null, {
        tp1At: o.tp1_hit_at as string | null,
        mpAt: o.mp_hit_at as string | null,
        slAt: o.sl_hit_at as string | null,
      }),
    };
  });

  return NextResponse.json({
    orders: enriched,
    // Data-freshness contract. The page shows these so an incomplete list is
    // never presented as though it were current: `syncedAt` stamps the last
    // successful reconciliation, and `syncError` says plainly when the broker
    // could not be reached, rather than letting the stale ledger pass for live.
    sync: {
      syncedAt: sync.syncedAt,
      syncError: sync.error,
      reconciled: sync.reconciled,
      orphaned: sync.orphaned,
      source: "alpaca-paper",
    },
    // What the staged exits did on this pass. Reported rather than silent: a
    // stop that moved is a change to the user's risk, and one that couldn't be
    // moved is something they need to know about while they can still act.
    exits: {
      managed: exits.managed,
      attached: exits.attached,
      adjusted: exits.adjusted,
      closed: exits.closed,
      notes: exits.notes,
      error: exits.error,
    },
  });
}

interface SyncOutcome {
  syncedAt: string | null;
  error: string | null;
  reconciled: number;
  orphaned: number;
  /** Re-read rows when anything changed; null when the ledger is unchanged. */
  refreshed: Record<string, unknown>[] | null;
}

/**
 * Bring locally-working orders in line with the broker.
 *
 * Only rows still in a working state are chased, and the broker window starts
 * at the oldest of those rows. A ledger with nothing working costs no broker
 * call at all, which matters because the Portfolio polls this endpoint on a
 * timer.
 *
 * A broker failure is reported, never swallowed: the caller surfaces it so the
 * user knows the list in front of them may be behind.
 */
async function syncWithBroker(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orders: Record<string, unknown>[],
): Promise<SyncOutcome> {
  // Working orders, plus anything previously marked `sync_error`.
  //
  // An orphaned row normalizes to `unknown`, which `isWorking` reports false
  // for — correct for display, since it must stop looking live, but it made the
  // marking permanent: the row was filtered out of every subsequent
  // reconciliation and could never recover. A transient broker outage is the
  // most likely way a row gets orphaned in the first place, so the state has to
  // be re-checkable. It is chased again here and returns to its true status the
  // moment the broker reports one.
  const working = orders.filter((o) => {
    const status = normalizeOrderStatus(String(o.status ?? ""));
    return isWorking(status) || status === "unknown";
  });
  if (working.length === 0) {
    return { syncedAt: new Date().toISOString(), error: null, reconciled: 0, orphaned: 0, refreshed: null };
  }

  const creds = envCreds("paper");
  if (!creds) {
    return {
      syncedAt: null,
      error: "Paper trading is not configured, so order statuses can't be confirmed with the broker.",
      reconciled: 0,
      orphaned: 0,
      refreshed: null,
    };
  }

  // Start the broker window a day before the oldest working order so a
  // boundary order can't fall outside it and be mistaken for one the broker
  // has no record of.
  const oldest = working.reduce((min, o) => {
    const t = Date.parse(String(o.created_at ?? ""));
    return Number.isNaN(t) ? min : Math.min(min, t);
  }, Date.now());
  const since = new Date(oldest - 24 * 3600 * 1000);

  let brokerOrders: BrokerOrder[];
  try {
    brokerOrders = (await listOrders(creds, { since })) as unknown as BrokerOrder[];
  } catch (err) {
    console.error(`orders: broker sync failed — ${err instanceof Error ? err.message : String(err)}`);
    return {
      syncedAt: null,
      error: "Couldn't reach the broker to confirm order statuses. The list below may be out of date.",
      reconciled: 0,
      orphaned: 0,
      refreshed: null,
    };
  }

  const local: LocalOrder[] = working.map((o) => ({
    id: String(o.id),
    broker_order_id: o.broker_order_id == null ? null : String(o.broker_order_id),
    status: String(o.status ?? ""),
    filled_qty: numOrNull(o.filled_qty),
    filled_avg_price: numOrNull(o.filled_avg_price),
    created_at: String(o.created_at ?? ""),
  }));

  const now = new Date();
  const { updates, orphanedIds } = reconcileOrders(local, brokerOrders, now);
  if (updates.length === 0 && orphanedIds.length === 0) {
    return { syncedAt: now.toISOString(), error: null, reconciled: 0, orphaned: 0, refreshed: null };
  }

  const writes: PromiseLike<{ error: { message: string } | null }>[] = updates.map((u) =>
    supabase
      .from("orders")
      .update({
        status: u.status,
        filled_qty: u.filled_qty,
        filled_avg_price: u.filled_avg_price,
        broker_submitted_at: u.broker_submitted_at,
        // Never overwrite a reason we already recorded with a null.
        ...(u.reject_reason ? { reject_reason: u.reject_reason } : {}),
        last_synced_at: u.last_synced_at,
        updated_at: u.last_synced_at,
      })
      .eq("id", u.id),
  );

  // An order the broker has no record of stops being presented as live. It
  // becomes `sync_error`, which normalizes to "unknown" and renders with a
  // visible flag rather than sitting in Pending indefinitely.
  if (orphanedIds.length > 0) {
    writes.push(
      supabase
        .from("orders")
        .update({ status: "sync_error", last_synced_at: now.toISOString() })
        .in("id", orphanedIds),
    );
  }

  const results = await Promise.all(writes);
  const writeError = results.find((r) => r?.error)?.error;
  if (writeError) {
    console.error(`orders: reconciliation write failed — ${writeError.message}`);
    return {
      syncedAt: null,
      error: "Order statuses were read from the broker but couldn't be saved. Try refreshing.",
      reconciled: updates.length,
      orphaned: orphanedIds.length,
      refreshed: null,
    };
  }

  const { data: refreshed } = await supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  return {
    syncedAt: now.toISOString(),
    error: null,
    reconciled: updates.length,
    orphaned: orphanedIds.length,
    refreshed: (refreshed ?? null) as Record<string, unknown>[] | null,
  };
}

function numOrNull(v: unknown): number | null {
  const n = Number(v);
  return v == null || Number.isNaN(n) ? null : n;
}

interface Mark {
  currentPrice: number;
  dayPl: number;
  dayPlPct: number;
}

/**
 * The broker's open positions, or null when they couldn't be read.
 *
 * The distinction matters more than it looks: an empty list means "you hold
 * nothing", and the exit manager retires a plan whose symbol isn't in the list.
 * Returning `[]` on a failed fetch would therefore close every live plan and
 * log every open trade as finished. A broker hiccup returns null instead, and
 * the manager sits the pass out.
 */
async function openPositions(creds: AlpacaCreds): Promise<AlpacaPosition[] | null> {
  try {
    return await getPositions(creds);
  } catch {
    return null;
  }
}

/** Current price + intraday P/L per symbol, from the broker's open positions. */
function markPrices(positions: AlpacaPosition[]): Map<string, Mark> {
  const marks = new Map<string, Mark>();
  for (const p of positions) {
    marks.set(String(p.symbol).toUpperCase(), {
      currentPrice: Number(p.current_price),
      dayPl: Number(p.unrealized_intraday_pl),
      dayPlPct: Number(p.unrealized_intraday_plpc) * 100,
    });
  }
  return marks;
}

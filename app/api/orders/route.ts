/**
 * GSPS — /api/orders
 * POST: place an order (paper by default; live requires a connected live broker).
 * GET:  list the user's orders (mirrored in Supabase).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { envCreds, getPositions, placeOrder } from "@/lib/brokers/alpaca";
import { checkBracket } from "@/lib/trade/bracket";
import { evaluateTargets } from "@/lib/trade/targets";

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

  // Brackets only apply to long equity entries (both legs, buy side, on Alpaca).
  const useBracket = !isOption && !!input.attachLevels && input.side === "buy";
  const orderType = input.limitPrice ? "limit" : "market";

  // Alpaca requires the stop below and the target above the entry (by at least
  // a cent). The protocol computes its levels against the advised entry, so a
  // market entry on the other side of that price produces legs the broker will
  // refuse — catch it here with wording that says what to do about it.
  if (useBracket) {
    const basePrice = input.limitPrice ?? input.referencePrice ?? 0;
    const check = checkBracket({
      side: input.side,
      basePrice,
      stopLoss: input.attachLevels!.stopLoss,
      takeProfit: input.attachLevels!.takeProfit,
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

  try {
    // Real order (equity or option) — options carry a real Alpaca OCC symbol
    // from /api/options/chain, not a fabricated one.
    const broker = await placeOrder(creds, {
      symbol: input.symbol,
      side: input.side,
      qty: input.qty,
      type: !isOption && input.entryMode === "advised" ? "limit" : orderType,
      limitPrice: input.limitPrice,
      bracket: useBracket
        ? { stopLoss: input.attachLevels!.stopLoss, takeProfit: input.attachLevels!.takeProfit }
        : undefined,
    });

    const { error: dbError } = await supabase.from("orders").insert({
      user_id: user.id,
      mode: "paper",
      broker_order_id: broker.id,
      symbol: input.symbol.toUpperCase(),
      asset_class: isOption ? "option" : "us_equity",
      side: input.side,
      order_type: useBracket ? "bracket" : !isOption && input.entryMode === "advised" ? "limit" : orderType,
      qty: input.qty,
      limit_price: input.limitPrice ?? null,
      stop_price: useBracket ? input.attachLevels!.stopLoss : null,
      take_profit: useBracket ? input.attachLevels!.takeProfit : null,
      master_profit: useBracket ? input.attachLevels!.masterProfit ?? null : null,
      status: broker.status ?? "new",
      // Option economics + greeks snapshot (null on equity orders).
      purchase_price: input.optionDetail?.premium ?? input.limitPrice ?? null,
      contract_cost: input.optionDetail?.contractCost ?? null,
      option_type: input.optionDetail?.type ?? null,
      strike: input.optionDetail?.strike ?? null,
      expiration: input.optionDetail?.expiration ?? null,
      delta: input.optionDetail?.delta ?? null,
      gamma: input.optionDetail?.gamma ?? null,
      theta: input.optionDetail?.theta ?? null,
      vega: input.optionDetail?.vega ?? null,
    });

    return NextResponse.json({ order: broker, mirrored: !dbError });
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    const friendly = explainBrokerError(raw, input.side, isOption);
    return NextResponse.json({ error: friendly.message, code: friendly.code, raw }, { status: friendly.status });
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
 * List the user's orders, enriched with a live mark for anything still held.
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
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const orders = (data ?? []) as Record<string, unknown>[];
  const marks = await liveMarks(orders.map((o) => String(o.symbol)));

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

  return NextResponse.json({ orders: enriched });
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

/** Current price + intraday P/L per symbol, from the broker's open positions. */
async function liveMarks(symbols: string[]): Promise<Map<string, Mark>> {
  const marks = new Map<string, Mark>();
  if (symbols.length === 0) return marks;

  const creds = envCreds("paper");
  if (!creds) return marks;

  try {
    const positions = await getPositions(creds);
    for (const p of positions) {
      marks.set(String(p.symbol).toUpperCase(), {
        currentPrice: Number(p.current_price),
        dayPl: Number(p.unrealized_intraday_pl),
        dayPlPct: Number(p.unrealized_intraday_plpc) * 100,
      });
    }
  } catch {
    // A broker hiccup shouldn't blank the order history — rows just render
    // without a live mark.
  }
  return marks;
}

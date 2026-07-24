/**
 * GSPS — /api/orders
 * POST: place an order (paper by default; live requires a connected live broker).
 * GET:  list the user's orders (mirrored in Supabase).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { envCreds, placeOrder } from "@/lib/brokers/alpaca";

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
    });

    return NextResponse.json({ order: broker, mirrored: !dbError });
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    const friendly = explainBrokerError(raw, input.side, isOption);
    return NextResponse.json({ error: friendly.message, code: friendly.code, raw }, { status: friendly.status });
  }
}

/**
 * Map opaque Alpaca rejections to actionable guidance. The paper account can't
 * short some names and needs options enabled before it will accept contracts.
 */
function explainBrokerError(
  raw: string,
  side: "buy" | "sell",
  isOption: boolean,
): { message: string; code: string; status: number } {
  const lower = raw.toLowerCase();
  if (lower.includes("not allowed to short") || lower.includes("40310000")) {
    return {
      code: "short_not_allowed",
      status: 422,
      message:
        "This paper account can't short this symbol. To trade the bearish setup, buy a PUT (switch to Options above) or wait for a long entry.",
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
  return { code: "broker_error", status: 502, message: raw };
}

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
  return NextResponse.json({ orders: data });
}

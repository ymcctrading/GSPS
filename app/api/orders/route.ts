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
  symbol: z.string().min(1).max(12),
  side: z.enum(["buy", "sell"]),
  qty: z.number().int().positive().max(100000),
  entryMode: z.enum(["advised", "now"]),
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
  if (input.entryMode === "advised" && !input.limitPrice) {
    return NextResponse.json({ error: "Advised-price orders need a limitPrice" }, { status: 400 });
  }

  const creds = envCreds("paper");
  if (!creds) {
    return NextResponse.json(
      { error: "Paper trading is not configured (missing Alpaca API keys)." },
      { status: 503 },
    );
  }

  try {
    const broker = await placeOrder(creds, {
      symbol: input.symbol,
      side: input.side,
      qty: input.qty,
      type: input.entryMode === "advised" ? "limit" : "market",
      limitPrice: input.limitPrice,
      // Bracket orders only support buy-side entries with both legs on Alpaca;
      // attach when levels are provided and the entry is a buy.
      bracket:
        input.attachLevels && input.side === "buy"
          ? { stopLoss: input.attachLevels.stopLoss, takeProfit: input.attachLevels.takeProfit }
          : undefined,
    });

    const { error: dbError } = await supabase.from("orders").insert({
      user_id: user.id,
      mode: "paper",
      broker_order_id: broker.id,
      symbol: input.symbol.toUpperCase(),
      side: input.side,
      order_type: input.attachLevels && input.side === "buy" ? "bracket" : input.entryMode === "advised" ? "limit" : "market",
      qty: input.qty,
      limit_price: input.limitPrice ?? null,
      stop_price: input.attachLevels?.stopLoss ?? null,
      take_profit: input.attachLevels?.takeProfit ?? null,
      master_profit: input.attachLevels?.masterProfit ?? null,
      status: broker.status ?? "new",
    });

    return NextResponse.json({ order: broker, mirrored: !dbError });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
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

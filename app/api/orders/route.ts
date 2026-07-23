/**
 * POST /api/orders — submit a paper order to Alpaca.
 *
 * Body: { symbol, qty, side: "buy"|"sell", entryType: "advised"|"market",
 *         limitPrice?, attachBracket?, stop?, tp1? }
 *
 * When attachBracket is set with stop + tp1, submits an Alpaca bracket order so
 * the protocol stop and take-profit are attached automatically. Requires
 * ALPACA_KEY_ID / ALPACA_SECRET_KEY; returns 400 with a clear message if absent.
 */

import { NextRequest, NextResponse } from "next/server";
import { alpacaConfigured } from "@/lib/alpaca";

export const dynamic = "force-dynamic";

const BASE =
  process.env.ALPACA_PAPER_BASE_URL ?? "https://paper-api.alpaca.markets";

export async function POST(req: NextRequest) {
  if (!alpacaConfigured()) {
    return NextResponse.json(
      {
        error:
          "Alpaca paper keys not configured. Add ALPACA_KEY_ID and ALPACA_SECRET_KEY in Vercel env to place paper orders.",
      },
      { status: 400 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const symbol = String(body.symbol ?? "").toUpperCase();
  const qty = Number(body.qty ?? 0);
  const side = body.side === "sell" ? "sell" : "buy";
  const entryType = body.entryType === "market" ? "market" : "advised";
  const attachBracket = Boolean(body.attachBracket);
  const limitPrice = body.limitPrice != null ? Number(body.limitPrice) : null;
  const stop = body.stop != null ? Number(body.stop) : null;
  const tp1 = body.tp1 != null ? Number(body.tp1) : null;

  if (!symbol || qty <= 0) {
    return NextResponse.json(
      { error: "symbol and a positive qty are required" },
      { status: 400 },
    );
  }

  const order: Record<string, unknown> = {
    symbol,
    qty,
    side,
    time_in_force: attachBracket ? "gtc" : "day",
  };

  if (entryType === "advised" && limitPrice != null) {
    order.type = "limit";
    order.limit_price = limitPrice;
  } else {
    order.type = "market";
  }

  if (attachBracket && stop != null && tp1 != null) {
    order.order_class = "bracket";
    order.take_profit = { limit_price: tp1 };
    order.stop_loss = { stop_price: stop };
  }

  try {
    const res = await fetch(`${BASE}/v2/orders`, {
      method: "POST",
      headers: {
        "APCA-API-KEY-ID": process.env.ALPACA_KEY_ID ?? "",
        "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET_KEY ?? "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(order),
      cache: "no-store",
    });
    const json = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { error: json?.message ?? "Alpaca rejected the order", detail: json },
        { status: res.status },
      );
    }
    return NextResponse.json({
      ok: true,
      id: json.id,
      status: json.status,
      symbol: json.symbol,
      qty: json.qty,
      side: json.side,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to reach Alpaca: ${String(err)}` },
      { status: 502 },
    );
  }
}

/**
 * GSPS — POST /api/orders/[id]/cancel
 *
 * Manually cancels a resting (pending, not yet filled) order — the gap the
 * project owner named directly: "There should be an option to manually
 * close pending positions." Before this route, the only path off a pending
 * order was the automatic one: lib/trade/invalidate-pending.ts's stop-cross
 * check, run by lib/brokers/simulator.ts#evaluateRestingOrders on every
 * `/api/orders` GET — and that check only ever runs for paper orders
 * (`.eq("mode", "paper")` there). A live pending order had no way off at
 * all, automatic or manual.
 *
 * Live: calls Alpaca's own cancel endpoint (lib/brokers/alpaca.ts#cancelOrder
 * — already implemented, already used by the protocol-exit manager to pull a
 * resting stop/target leg, but never wired to a user-facing cancel action)
 * before updating the local row, so the broker's own state and this ledger's
 * copy of it can't drift. Paper: local-only, there is no broker to tell.
 *
 * Only ever acts on the caller's own order, and only while it's still
 * actually pending — cancelling something already filled/rejected/canceled
 * would either be a no-op dressed up as a success or, worse, silently
 * overwrite a real terminal status with a manual one.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { normalizeOrderStatus } from "@/lib/portfolio/order-status";
import { readLiveAlpacaConnection } from "@/lib/brokers/live-creds";
import { cancelOrder } from "@/lib/brokers/alpaca";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const service = createServiceClient();
  const { data: order, error: readError } = await service
    .from("orders")
    .select("id, user_id, mode, status, broker_order_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (readError) {
    return NextResponse.json({ error: readError.message }, { status: 500 });
  }
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  if (normalizeOrderStatus(order.status) !== "pending") {
    return NextResponse.json(
      { error: "This order is no longer pending — nothing to cancel." },
      { status: 409 },
    );
  }

  if (order.mode === "live") {
    if (!order.broker_order_id) {
      return NextResponse.json(
        { error: "This live order has no broker order id on record — cannot cancel at the broker." },
        { status: 409 },
      );
    }
    const connection = await readLiveAlpacaConnection(service, user.id);
    if (!connection) {
      return NextResponse.json(
        { error: "No connected live brokerage — cannot cancel a live order." },
        { status: 400 },
      );
    }
    try {
      await cancelOrder(connection.creds, order.broker_order_id);
    } catch (err) {
      return NextResponse.json(
        { error: `Broker did not confirm the cancel — ${err instanceof Error ? err.message : String(err)}` },
        { status: 502 },
      );
    }
  }

  const { error: updateError } = await service
    .from("orders")
    .update({
      status: "canceled",
      reject_reason: "Canceled by user.",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("status", order.status);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/**
 * GSPS — /api/audit/orders
 *
 * The signed-in member's order audit trail as a CSV download
 * (`lib/audit/orderTrail.ts`): every order, the plan it was placed on, what
 * the broker did with it and how the trade closed. Read with the member's own
 * session, so row-level security keeps it to their rows; nothing is written.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  buildOrderTrail,
  trailCsv,
  type TrailOrder,
  type TrailPlan,
  type TrailTradeLog,
} from "@/lib/audit/orderTrail";

/** The most orders one download carries, newest first. */
const AUDIT_ORDER_LIMIT = 5000;
/** `.in()` lists are sent in the URL, so ids go in slices. */
const ID_SLICE = 200;

const ORDER_COLUMNS =
  "id, created_at, mode, symbol, side, order_type, qty, limit_price, stop_price, take_profit, master_profit, level_source, strategy_version, status, broker_submitted_at, reject_reason, filled_qty, filled_avg_price, source_plan_id";
const PLAN_COLUMNS = "plan_id, generated_at, entry_trigger, invalidation, take_profit_1, master_profit, state";
const LOG_COLUMNS = "order_id, exit_timestamp, exit_price, outcome, profit_loss_dollars, exit_condition";

function slices<T>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += ID_SLICE) out.push(items.slice(i, i + ID_SLICE));
  return out;
}

const FAILED = "Your audit trail couldn't be read just now. Try again in a minute.";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to download your audit trail." }, { status: 401 });

  const { data: orderRows, error: ordersError } = await supabase
    .from("orders")
    .select(ORDER_COLUMNS)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(AUDIT_ORDER_LIMIT);
  if (ordersError) {
    console.error("audit/orders: orders read failed", ordersError.message);
    return NextResponse.json({ error: FAILED }, { status: 500 });
  }
  const orders = (orderRows ?? []) as TrailOrder[];

  const planIds = [...new Set(orders.map((o) => o.source_plan_id).filter((id): id is string => !!id))];
  const orderIds = orders.map((o) => o.id);
  const plans: TrailPlan[] = [];
  const logs: TrailTradeLog[] = [];
  try {
    for (const ids of slices(planIds)) {
      const { data, error } = await supabase.from("trade_plans").select(PLAN_COLUMNS).eq("user_id", user.id).in("plan_id", ids);
      if (error) throw new Error(error.message);
      plans.push(...((data ?? []) as TrailPlan[]));
    }
    for (const ids of slices(orderIds)) {
      const { data, error } = await supabase.from("trade_logs").select(LOG_COLUMNS).eq("user_id", user.id).in("order_id", ids);
      if (error) throw new Error(error.message);
      logs.push(...((data ?? []) as TrailTradeLog[]));
    }
  } catch (e) {
    console.error("audit/orders: plan or trade log read failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: FAILED }, { status: 500 });
  }

  // A byte-order mark, so a spreadsheet opens a broker's non-ASCII refusal
  // text as UTF-8 rather than guessing a code page.
  const csv = "\ufeff" + trailCsv(buildOrderTrail(orders, plans, logs));
  const day = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="order-audit-trail-${day}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

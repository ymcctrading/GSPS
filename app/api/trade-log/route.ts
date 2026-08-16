/**
 * GSPS — /api/trade-log
 * POST: Log a trade entry or exit event for audit trail and analytics.
 * GET:  the log.
 *
 * Paper trades are simulated (see `lib/brokers/simulator.ts`), so a fill's
 * price is known the instant it happens — there is no external broker to wait
 * on, and every row this app writes for a paper trade is already settled by
 * the time it lands. `settlePendingTradeLogs` still exists for live trades
 * placed through a real connected broker, but nothing routes through this GET
 * anymore; it stays a live-trading concern for whichever endpoint drives that.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const TradeLogSchema = z.object({
  orderId: z.string().uuid().optional(),
  positionId: z.string().uuid().optional(),
  symbol: z.string().min(1).max(20),
  direction: z.enum(["buy", "sell"]),
  quantity: z.number().positive(),
  entryTimestamp: z.string().datetime().optional(),
  entryPrice: z.number().positive(),
  exitTimestamp: z.string().datetime().optional(),
  exitPrice: z.number().positive().optional(),
  outcome: z.enum(["profit", "loss", "pending"]).optional(),
  profitLossDollars: z.number().optional(),
  profitLossPercent: z.number().optional(),
  exitCondition: z.enum(["tp1", "master_target", "stop_loss", "manual", "pending"]).optional(),
  signalCalled: z.string(),
  signalAdherence: z.enum(["yes", "no", "partial"]).optional(),
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const parsed = TradeLogSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid trade log data" }, { status: 400 });
  }

  const input = parsed.data;

  try {
    const { data, error } = await supabase.from("trade_logs").insert({
      user_id: user.id,
      order_id: input.orderId ?? null,
      position_id: input.positionId ?? null,
      symbol: input.symbol.toUpperCase(),
      asset_class: "us_equity",
      direction: input.direction,
      quantity: input.quantity,
      entry_timestamp: input.entryTimestamp ? new Date(input.entryTimestamp).toISOString() : new Date().toISOString(),
      entry_price: input.entryPrice,
      exit_timestamp: input.exitTimestamp ? new Date(input.exitTimestamp).toISOString() : null,
      exit_price: input.exitPrice ?? null,
      outcome: input.outcome ?? "pending",
      profit_loss_dollars: input.profitLossDollars ?? null,
      profit_loss_percent: input.profitLossPercent ?? null,
      exit_condition: input.exitCondition ?? "pending",
      signal_called: input.signalCalled,
      signal_adherence: input.signalAdherence ?? null,
    })
      // Without this the insert returns no rows and `tradeLog` was always
      // undefined — the response said a row came back and never carried one.
      .select("*")
      .maybeSingle();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      tradeLog: data,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
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

  try {
    const { data, error } = await supabase
      .from("trade_logs")
      .select("*")
      .order("entry_timestamp", { ascending: false })
      .limit(100);

    if (error) throw error;

    const stillPending = (data ?? []).filter((row) => row.outcome === "pending").length;

    return NextResponse.json({
      tradeLogs: data,
      // Paper trades resolve at fill time, so this should always read zero —
      // kept in the response shape so a client built against the old contract
      // doesn't need to change.
      settlement: { settled: 0, stillPending, error: null },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

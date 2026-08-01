/**
 * GSPS — /api/portfolio/close
 * POST: manually flatten an open position at market. The next portfolio
 * poll's reconciliation pass records the close (exit_condition "manual"
 * since this isn't a bracket leg) into `positions` and `trade_logs`.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { envCreds, closePosition } from "@/lib/brokers/alpaca";

const CloseSchema = z.object({
  symbol: z.string().min(1).max(24),
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const parsed = CloseSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "A symbol is required" }, { status: 400 });
  }

  const creds = envCreds("paper");
  if (!creds) {
    return NextResponse.json(
      { error: "Paper trading is not configured (missing Alpaca API keys)." },
      { status: 503 },
    );
  }

  try {
    const order = await closePosition(creds, parsed.data.symbol.toUpperCase());
    return NextResponse.json({ order });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}

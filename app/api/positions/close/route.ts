/**
 * GSPS — /api/positions/close
 * POST: liquidate an open position at market (whole position, or a partial
 * quantity). Backs the "Close position" action in the portfolio's open-positions
 * grid, and is rule 3's manual escape hatch out of a staged protocol exit.
 *
 * Paper trading is simulated (see lib/brokers/simulator.ts), so the fill and
 * its price are known synchronously — there is no broker to wait on, and this
 * route writes the trade log itself instead of leaving it pending for
 * settlement. Two lifecycles still meet here, same as before:
 *
 *   - **Protocol-managed** (a working `protocol_exits` plan for the symbol):
 *     `closeSimPlanForSymbol` retires the plan and writes its own blended
 *     trade log across whatever tranches already filled plus this close.
 *   - **Plain** (no plan ever existed for the symbol): this route writes the
 *     trade log itself, directly, using the fill this call just produced.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { closePaperPosition } from "@/lib/trade/close-position";

const CloseSchema = z.object({
  symbol: z.string().min(1).max(24),
  /** Omit to close the entire position. */
  qty: z.number().positive().max(100000).optional(),
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
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(await closePaperPosition(supabase, user.id, parsed.data.symbol, parsed.data.qty));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}

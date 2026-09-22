/**
 * GSPS — /api/positions/update-exit
 * POST: manually increase/decrease the stop-loss, TP1, and/or master profit
 * on a position's already-working staged exit. See
 * lib/trade/attach-protocol-exit.ts's `updateProtocolExit` for the rules —
 * most importantly, the stop-loss can only be tightened, and only once the
 * position is in profit.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { updateProtocolExit } from "@/lib/trade/attach-protocol-exit";

const UpdateSchema = z
  .object({
    symbol: z.string().min(1).max(24),
    stopLoss: z.number().positive().optional(),
    takeProfit1: z.number().positive().optional(),
    masterProfit: z.number().positive().nullable().optional(),
  })
  .refine(
    (v) => v.stopLoss != null || v.takeProfit1 != null || v.masterProfit !== undefined,
    { message: "Enter a new stop loss, TP1, and/or master profit to update." },
  );

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const parsed = UpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  const result = await updateProtocolExit(supabase, user.id, parsed.data);
  return NextResponse.json(result.body, { status: result.status });
}

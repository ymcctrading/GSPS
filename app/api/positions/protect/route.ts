/**
 * GSPS — /api/positions/protect
 * POST: attach a stop-loss and take-profit to a position that's already
 * open — the conditional-order primitive `lib/trade/place-order.ts`'s
 * `attachLevels` only offers at order submission, extended to cover a
 * position that was opened without them. See lib/trade/attach-protocol-exit.ts.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { attachProtocolExit } from "@/lib/trade/attach-protocol-exit";

const ProtectSchema = z.object({
  symbol: z.string().min(1).max(24),
  stopLoss: z.number().positive(),
  takeProfit: z.number().positive(),
  masterProfit: z.number().positive().optional(),
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  // No kill-switch check, deliberately — same reasoning as /api/positions/close:
  // attaching a protective stop/target only ever reduces the risk on an
  // existing position, it never opens a new one.
  const parsed = ProtectSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  const result = await attachProtocolExit(supabase, user.id, parsed.data);
  return NextResponse.json(result.body, { status: result.status });
}

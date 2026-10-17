/**
 * GSPS — /api/positions/close-all
 * POST: close every open paper position at market. Gann's rule to close out
 * every trade twice a year and rest (M-K4; owner's Q16, "Button"), and to go
 * flat before an absence (A-EXIT-05). Opt-in: only a person's own tap on the
 * Dashboard reminder calls it, after a confirm. Nothing calls it on a schedule.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { closeAllPaperPositions } from "@/lib/trade/close-position";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    const result = await closeAllPaperPositions(supabase, user.id);
    return NextResponse.json({ ok: result.failed.length === 0, ...result }, { status: result.failed.length ? 207 : 200 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}

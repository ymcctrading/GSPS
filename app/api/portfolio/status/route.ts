/**
 * GSPS — /api/portfolio/status
 * Whether the signed-in member's simulated paper account is ready, for the
 * Settings card. It reads only the account row (creating it on first use),
 * so it answers in well under a second. Settings used to call
 * `/api/portfolio`, which also advances every staged exit and quotes every
 * held symbol; on a slow host that passed the page's 10-second wait, and the
 * card showed "Couldn't check paper trading status" though nothing was wrong.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateAccount } from "@/lib/brokers/simulator";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    await getOrCreateAccount(supabase, user.id);
    return NextResponse.json({ connected: true });
  } catch (err) {
    console.error("portfolio/status:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: "The paper account couldn't be read." }, { status: 503 });
  }
}

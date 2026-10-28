/**
 * GSPS — /api/account/novice
 *
 * Whether the signed-in member is on the Novice (PRACTICE) tier, resolved on
 * the server so no client component guesses a tier (AGENTS.md, Polarity
 * audit). Read by `components/education/sell-setup-help.tsx` on surfaces with
 * no server-resolved tier at hand.
 *
 * GET -> { novice: boolean }; 401 when signed out. Reads the tier itself
 * rather than through `getUserTier`, which falls back to PRACTICE on a failed
 * read: here a failed read is "not Novice", so no higher tier is shown the
 * Novice note by mistake.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data, error } = await supabase.from("profiles").select("tier").eq("id", user.id).maybeSingle();
  if (error) return NextResponse.json({ error: "Couldn't read your plan." }, { status: 502 });
  return NextResponse.json({ novice: (data as { tier?: unknown } | null)?.tier === "PRACTICE" });
}

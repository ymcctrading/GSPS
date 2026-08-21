/**
 * GSPS — /r/<code>
 *
 * A referral link's landing point. Logs the click (best-effort — a failed
 * write must never block the redirect a visitor is waiting on) and forwards
 * to signup with the code carried through as `ref`, which `AuthForm` reads
 * and passes into `supabase.auth.signUp`'s metadata so `handle_new_user`
 * (migration 0024) can attribute the resulting account.
 *
 * The code isn't resolved to a referrer id here — that's a duplicate of what
 * the signup trigger already does, and this route has nothing to gain from
 * doing it twice. Writing the raw code lets `/api/referral` join it back to
 * a referrer for the click count without this route needing to know whether
 * the code is even valid; an unresolvable code just never joins to anyone.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const signupUrl = new URL("/signup", req.url);
  if (code) signupUrl.searchParams.set("ref", code);

  if (code) {
    try {
      const supabase = createServiceClient();
      const { data: referrer } = await supabase
        .from("profiles")
        .select("id")
        .ilike("username", code)
        .maybeSingle();
      await supabase
        .from("referral_link_clicks")
        .insert({ code, referrer_id: (referrer as { id: string } | null)?.id ?? null });
    } catch {
      // A click that fails to log is still a click that should reach signup.
    }
  }

  return NextResponse.redirect(signupUrl);
}

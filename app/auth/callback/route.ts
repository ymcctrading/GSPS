import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";
  const ref = searchParams.get("ref");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // OAuth signup never runs `handle_new_user` with `ref` in metadata —
      // Google, not this app, creates the auth.users row — so attribution has
      // to happen here instead, once, only for a profile that has none yet.
      // A returning user completing Google login through a referral link must
      // never have their existing attribution overwritten.
      if (ref) {
        const { data: user } = await supabase.auth.getUser();
        if (user.user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("referred_by")
            .eq("id", user.user.id)
            .maybeSingle();
          if (profile && !(profile as { referred_by: string | null }).referred_by) {
            const { data: referrer } = await supabase
              .from("profiles")
              .select("id")
              .ilike("username", ref)
              .neq("id", user.user.id)
              .maybeSingle();
            const referrerId = (referrer as { id: string } | null)?.id;
            if (referrerId) {
              await supabase.from("profiles").update({ referred_by: referrerId }).eq("id", user.user.id);
            }
          }
        }
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}

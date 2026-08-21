/**
 * GSPS — /api/referral
 *
 * The numbers behind a user's own referral link: their username-derived
 * code, how many times it's been clicked, and how many of those clicks (or
 * direct signups with the code) turned into an attributed account.
 *
 * Read-only. The link itself is derived from the same username Account
 * Settings already lets a user set — there is no separate "referral code" to
 * generate or store.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .maybeSingle();
  const username = (profile as { username: string | null } | null)?.username ?? null;

  if (!username) {
    return NextResponse.json({ username: null, clickCount: 0, signupCount: 0 });
  }

  // RLS on `profiles` only lets a user read their own row, so the signup
  // count can't be a direct select against rows referred_by=user.id — those
  // are other people's profiles. `referral_stats()` is a SECURITY DEFINER
  // function scoped to auth.uid() for exactly that reason (migration 0024).
  const { data: stats } = await supabase.rpc("referral_stats").single();
  const row = stats as { click_count: number | null; signup_count: number | null } | null;

  return NextResponse.json({
    username,
    clickCount: row?.click_count ?? 0,
    signupCount: row?.signup_count ?? 0,
  });
}

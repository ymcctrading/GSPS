/**
 * GSPS — /api/auth/account-status
 *
 * POST { email } → { exists: false } | { exists: true, confirmed: boolean }
 *
 * Lets the signup form tell an existing account from a brand-new one before
 * calling `auth.signUp` — see `components/auth/auth-form.tsx`. Needs the
 * service-role client because `auth.users` isn't reachable from the anon
 * client; the actual read happens in `public.find_auth_user_by_email`
 * (supabase/migrations/0029_account_status_lookup.sql, locked down to
 * service-role-only in 0030), which returns only `id` and
 * `email_confirmed_at`.
 *
 * This is a deliberate, server-side-only email-existence check — the product
 * behavior it enables (different messaging for "confirm your email" vs.
 * "reset your password" vs. "create an account") needs it. It is not exposed
 * to the browser directly (the SQL function's EXECUTE is revoked from
 * anon/authenticated), so this route is the only caller.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email) {
    return NextResponse.json({ error: "Email required" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("find_auth_user_by_email", { p_email: email });

  if (error) {
    console.error(`account-status: lookup failed — ${error.message}`);
    // Fail open to "doesn't exist" rather than blocking signup on an infra
    // hiccup — worst case is the ordinary signUp() duplicate-account path
    // handles it instead of this route's nicer messaging.
    return NextResponse.json({ exists: false });
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return NextResponse.json({ exists: false });
  return NextResponse.json({ exists: true, confirmed: row.email_confirmed_at != null });
}

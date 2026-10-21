/**
 * GSPS — /api/auth/username-login
 *
 * POST { username, password } → { ok: true } | { error } (401)
 *
 * Signs a person in by username without the email ever reaching the
 * browser. Supabase Auth's password grant takes an email, so the username is
 * resolved here, on the server (`resolve_username_email`, migration `0020`,
 * service-role only since `0028`), and the sign-in runs on the server client,
 * which sets the session cookies on this response.
 *
 * It replaces `/api/auth/resolve-username`, which returned the email to any
 * caller who named a username: a public username-to-email lookup (review
 * finding S-01, 2026-10-21). Every failure, whether the username is
 * malformed, unknown, or the password is wrong, gets the same answer, so the
 * route tells a caller nothing a wrong password wouldn't. `proxy.ts` puts it
 * in the credential bucket (5 a minute).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isValidUsername } from "@/lib/username";

const INVALID = () => NextResponse.json({ error: "Invalid login credentials" }, { status: 401 });

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { username?: unknown; password?: unknown } | null;
  const username = body?.username;
  const password = body?.password;
  if (!isValidUsername(username) || typeof password !== "string" || password.length === 0) {
    return INVALID();
  }

  const { data, error } = await createServiceClient().rpc("resolve_username_email", {
    p_username: username,
  });
  if (error || typeof data !== "string" || !data) return INVALID();

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email: data, password });
  if (signInError) return INVALID();
  return NextResponse.json({ ok: true });
}

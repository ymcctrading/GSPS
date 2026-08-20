/**
 * GSPS — /api/auth/resolve-username
 *
 * Resolves a username to the email its owner signs in with, for the login
 * form's "email or username" field — Supabase Auth's password grant only
 * accepts email/phone, never a username.
 *
 * This exists specifically so `resolve_username_email` (migration `0020`)
 * doesn't have to be callable directly by `anon`/`authenticated`. That grant
 * made it a public, unauthenticated oracle: every function in the `public`
 * schema is exposed as a PostgREST RPC, discoverable in the project's own
 * OpenAPI schema, so anyone could script a wordlist against
 * `/rest/v1/rpc/resolve_username_email` and recover real users' email
 * addresses with zero friction. Migration `0028` revoked that grant down to
 * `service_role`; this route is the only remaining caller.
 *
 * The response shape is identical whether the username is malformed,
 * unregistered, or a lookup error occurred — `{ email: null }` either way —
 * so this route doesn't become a smaller version of the same oracle it
 * replaces. It does not rate-limit; a caller who finds this route can still
 * probe it at whatever rate the platform allows. That's real residual risk,
 * not a solved problem — see the migration's comment.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { isValidUsername } from "@/lib/username";

const NOT_FOUND = NextResponse.json({ email: null });

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NOT_FOUND;
  }

  const username = (body as { username?: unknown } | null)?.username;
  if (!isValidUsername(username)) return NOT_FOUND;

  const { data, error } = await createServiceClient().rpc("resolve_username_email", {
    p_username: username,
  });

  if (error || !data) return NOT_FOUND;
  return NextResponse.json({ email: data as string });
}

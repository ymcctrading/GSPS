"use client";

import { createClient } from "@/lib/supabase/client";

/**
 * `/api/notifications/*` and `/api/portfolio/analytics` read a bearer token
 * rather than the cookie session every other route uses (they run on a
 * service-role client so they can bypass RLS after verifying the token
 * themselves — see those routes). This is the one place in the app that has
 * to attach `Authorization` by hand to reach them.
 */
export async function authorizedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const headers = new Headers(init.headers);
  if (session?.access_token) headers.set("Authorization", `Bearer ${session.access_token}`);
  return fetch(input, { ...init, headers });
}

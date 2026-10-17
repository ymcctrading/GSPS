/**
 * Caller identity for the `/api/notifications/push/*` routes.
 *
 * These routes are reached two ways, and both are legitimate, which is why
 * this helper exists rather than each route picking one:
 *
 * - The Settings UI, through `authorizedFetch` — an `Authorization: Bearer`
 *   access token, the pattern `/api/notifications/preferences` already uses.
 * - The service worker, on `pushsubscriptionchange` — the browser rotated a
 *   subscription's keys and the worker re-registers it. A worker has the
 *   member's cookies but no access token to attach, so a Bearer-only route
 *   would reject exactly the re-subscribe that keeps a device delivering.
 *
 * Returns the authenticated user's id, or null. Never trusts a body-supplied
 * profile id: a route that let a caller name the profile to attach a push
 * subscription to would let anyone redirect another member's alerts to their
 * own device.
 */

import type { NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function resolvePushRouteUserId(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const service = createServiceClient();
    const {
      data: { user },
    } = await service.auth.getUser(authHeader.slice(7));
    if (user) return user.id;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

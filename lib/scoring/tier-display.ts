/**
 * Server-only helper: resolves whether the current request's signed-in user
 * should see exact (unrounded) scores — see `lib/scoring/display.ts` and
 * `lib/entitlements/policy.ts`'s `exactScoreDisplayEnabled`.
 *
 * Defaults to `false` (rounded to the nearest half point) when signed out,
 * same fail-closed default `getUserTier` uses for an unresolved tier
 * (PRACTICE/Novice) — an anonymous viewer never sees more precision than the
 * lowest tier does.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getUserEntitlementPolicy } from "@/lib/entitlements/policy";
import { createClient } from "@/lib/supabase/server";

export async function resolveExactScoreDisplayEnabled(
  supabase?: SupabaseClient,
): Promise<boolean> {
  const client = supabase ?? (await createClient());
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return false;

  const policy = await getUserEntitlementPolicy(client, user.id);
  return policy.exactScoreDisplayEnabled;
}

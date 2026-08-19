/**
 * GSPS — /api/billing/status
 * Tells the settings page whether Stripe is configured and what tier the
 * signed-in user is currently on, so the upgrade UI can render a real state
 * instead of guessing from the client.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isStripeEnabled } from "@/lib/billing/stripe";
import { getUserTier, TIER_META } from "@/lib/tiers";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const tier = await getUserTier(supabase, user.id);
  return NextResponse.json({ enabled: isStripeEnabled(), tier, tierMeta: TIER_META });
}

/**
 * GSPS — /api/billing/checkout
 * Starts a Stripe Checkout session upgrading the signed-in user to a paid
 * tier (see lib/tiers.ts). The webhook (/api/billing/webhook) is what
 * actually flips profiles.tier once payment completes — this route only
 * hands back a redirect URL.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isStripeEnabled, stripeClient, priceIdFor, type BillableTier, type BillingInterval } from "@/lib/billing/stripe";
import { isWallStreetSchoolCompleted } from "@/lib/school/curriculum-service";

function appUrl(req: NextRequest): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
}

export async function POST(req: NextRequest) {
  if (!isStripeEnabled()) {
    return NextResponse.json({ error: "Billing is not configured yet." }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const tier = body.tier as BillableTier | undefined;
  const interval = (body.interval as BillingInterval | undefined) ?? "monthly";

  if (tier !== "INVESTOR_MODE" && tier !== "SYSTEM_MASTERY") {
    return NextResponse.json({ error: "Unknown tier" }, { status: 400 });
  }

  // Wall Street (SYSTEM_MASTERY) checkout requires the GSPS School capstone
  // (Academy 8, not Course W2) completed first — server-side, unbypassable
  // from the client. Pro/Expert purchase is never gated on School; see
  // lib/school/curriculum-service.ts and the product spec section 8/15.
  if (tier === "SYSTEM_MASTERY") {
    const completed = await isWallStreetSchoolCompleted(supabase, user.id);
    if (!completed) {
      return NextResponse.json(
        { error: "Complete the GSPS School Wall Street capstone before purchasing System Mastery.", code: "wall_street_school_incomplete" },
        { status: 403 },
      );
    }
  }

  const priceId = priceIdFor(tier, interval);
  if (!priceId) {
    return NextResponse.json(
      { error: `No Stripe price configured for ${tier}/${interval}` },
      { status: 503 },
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .single();

  const stripe = stripeClient();
  const origin = appUrl(req);

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: profile?.stripe_customer_id ?? undefined,
    customer_email: profile?.stripe_customer_id ? undefined : (user.email ?? undefined),
    client_reference_id: user.id,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/settings?upgraded=1`,
    cancel_url: `${origin}/settings`,
    metadata: { user_id: user.id, tier },
    subscription_data: { metadata: { user_id: user.id, tier } },
  });

  return NextResponse.json({ url: session.url });
}

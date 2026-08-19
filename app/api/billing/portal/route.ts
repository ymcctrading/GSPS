/**
 * GSPS — /api/billing/portal
 * Hands back a Stripe Billing Portal URL so a subscribed user can update
 * payment methods, change plans, or cancel — without GSPS building any of
 * that UI itself.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isStripeEnabled, stripeClient } from "@/lib/billing/stripe";

export async function POST(req: NextRequest) {
  if (!isStripeEnabled()) {
    return NextResponse.json({ error: "Billing is not configured yet." }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .single();

  if (!profile?.stripe_customer_id) {
    return NextResponse.json({ error: "No billing account on file yet" }, { status: 404 });
  }

  const stripe = stripeClient();
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${origin}/settings`,
  });

  return NextResponse.json({ url: session.url });
}

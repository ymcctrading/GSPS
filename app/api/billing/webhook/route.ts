/**
 * GSPS — /api/billing/webhook
 * Stripe calls back here on checkout completion and subscription lifecycle
 * changes. This is the only place profiles.tier is ever written from a
 * billing event — the checkout/portal routes just redirect to Stripe.
 *
 * Verifies the Stripe-Signature header against STRIPE_WEBHOOK_SECRET before
 * touching anything; an unverified body must never be trusted (see
 * SECURITY.md). Uses the service-role Supabase client because the customer
 * id, not a signed-in session, is the only identity Stripe gives us here.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { isStripeEnabled, stripeClient, tierForPriceId } from "@/lib/billing/stripe";

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// Downgrade target once a subscription ends. PRACTICE is the app-wide
// no-subscription default (lib/tiers.ts `getUserTier`) — kept in sync with
// that rather than re-deriving it here.
const FREE_TIER = "PRACTICE";

export async function POST(req: NextRequest) {
  if (!isStripeEnabled()) {
    return NextResponse.json({ error: "Billing is not configured" }, { status: 503 });
  }
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "STRIPE_WEBHOOK_SECRET is not configured" }, { status: 503 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  const rawBody = await req.text();
  const stripe = stripeClient();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    return NextResponse.json(
      { error: `Signature verification failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 400 },
    );
  }

  const supabase = serviceClient();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.client_reference_id ?? session.metadata?.user_id;
      const tier = session.metadata?.tier;
      if (!userId || !tier) break;

      await supabase
        .from("profiles")
        .update({
          tier,
          stripe_customer_id: typeof session.customer === "string" ? session.customer : session.customer?.id,
          stripe_subscription_id:
            typeof session.subscription === "string" ? session.subscription : session.subscription?.id,
        })
        .eq("id", userId);
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const priceId = subscription.items.data[0]?.price.id;
      const tier = priceId ? tierForPriceId(priceId) : null;
      const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
      if (!tier) break;

      const nextTier = subscription.status === "active" || subscription.status === "trialing" ? tier : FREE_TIER;
      await supabase
        .from("profiles")
        .update({ tier: nextTier, stripe_subscription_id: subscription.id })
        .eq("stripe_customer_id", customerId);
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
      await supabase
        .from("profiles")
        .update({ tier: FREE_TIER, stripe_subscription_id: null })
        .eq("stripe_customer_id", customerId);
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ received: true });
}

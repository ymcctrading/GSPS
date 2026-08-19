/**
 * Stripe wiring for the paid tiers defined in `lib/tiers.ts`. PRACTICE and
 * STANDARD are free and have no Stripe price; only INVESTOR_MODE and
 * SYSTEM_MASTERY are purchasable.
 *
 * Needs a real Stripe account before launch: create the two (or three, if
 * INVESTOR_MODE keeps its yearly option) recurring Prices in the Stripe
 * dashboard matching `TIER_META` in `lib/tiers.ts`, then set
 * STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, and the STRIPE_PRICE_* env vars
 * below. Until then `isStripeEnabled()` is false and the upgrade UI shows a
 * "billing not yet configured" state instead of a broken checkout button.
 */

import Stripe from "stripe";
import type { PlatformTier } from "@/lib/tiers";

export type BillableTier = "INVESTOR_MODE" | "SYSTEM_MASTERY";
export type BillingInterval = "monthly" | "yearly";

const PRICE_ENV_VAR: Record<BillableTier, Partial<Record<BillingInterval, string>>> = {
  INVESTOR_MODE: {
    monthly: "STRIPE_PRICE_INVESTOR_MODE_MONTHLY",
    yearly: "STRIPE_PRICE_INVESTOR_MODE_YEARLY",
  },
  SYSTEM_MASTERY: {
    monthly: "STRIPE_PRICE_SYSTEM_MASTERY_MONTHLY",
  },
};

export function isStripeEnabled(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

let client: Stripe | null = null;

export function stripeClient(): Stripe {
  if (!isStripeEnabled()) throw new Error("Stripe is not configured");
  if (!client) client = new Stripe(process.env.STRIPE_SECRET_KEY!);
  return client;
}

/** The Stripe Price id for a tier/interval combination, or null if unset (e.g. INVESTOR_MODE yearly before that price exists). */
export function priceIdFor(tier: BillableTier, interval: BillingInterval): string | null {
  const envVar = PRICE_ENV_VAR[tier][interval];
  if (!envVar) return null;
  return process.env[envVar] ?? null;
}

/** Reverse lookup used by the webhook handler: which tier a Stripe Price id maps to. */
export function tierForPriceId(priceId: string): BillableTier | null {
  for (const tier of Object.keys(PRICE_ENV_VAR) as BillableTier[]) {
    for (const envVar of Object.values(PRICE_ENV_VAR[tier])) {
      if (envVar && process.env[envVar] === priceId) return tier;
    }
  }
  return null;
}

export function isBillableTier(tier: PlatformTier): tier is BillableTier {
  return tier === "INVESTOR_MODE" || tier === "SYSTEM_MASTERY";
}

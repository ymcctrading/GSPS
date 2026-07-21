/**
 * Paywall overlay for tier-gated surfaces (scanner, automation, oscillators).
 * Renders children when entitled; otherwise a clean "unlock" overlay with the
 * upgrade CTA for the minimum required tier.
 */

import React from "react";
import {
  hasFeature,
  minimumTierFor,
  TIERS,
  type Feature,
  type PlatformTier,
} from "../engine/tiers/entitlements";

export interface FeatureGateProps {
  tier: PlatformTier;
  feature: Feature;
  title?: string;
  blurb?: string;
  onUpgrade?: (requiredTier: PlatformTier) => void;
  children: React.ReactNode;
}

export function FeatureGate({
  tier,
  feature,
  title,
  blurb,
  onUpgrade,
  children,
}: FeatureGateProps) {
  if (hasFeature(tier, feature)) return <>{children}</>;

  const required = minimumTierFor(feature);
  const def = required ? TIERS[required] : null;
  const price = def?.monthlyPriceUsd ? `$${def.monthlyPriceUsd}/mo` : "";

  return (
    <div className="relative overflow-hidden rounded-xl border border-[#30363D] bg-[#0D1117]">
      {/* Blurred preview of the locked surface */}
      <div className="pointer-events-none select-none opacity-30 blur-sm">
        {children}
      </div>
      {/* Overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0D1117]/70 p-6 text-center">
        <span className="text-2xl" aria-hidden>
          🔒
        </span>
        <h3 className="text-lg font-bold text-white">
          {title ?? `${def?.label ?? "Premium"}`}
        </h3>
        <p className="max-w-xs text-sm text-[#8B949E]">
          {blurb ??
            "Unlock the automated protocol scanner, strict Strat-sniper filters, and high-velocity volatility gates."}
        </p>
        {required && (
          <button
            type="button"
            onClick={() => onUpgrade?.(required)}
            className="mt-1 rounded-lg bg-[#238636] px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#2EA043]"
          >
            Upgrade to {def?.label}
            {price ? ` — ${price}` : ""}
          </button>
        )}
      </div>
    </div>
  );
}

export default FeatureGate;

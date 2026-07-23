import {
  minimumTierFor,
  TIERS,
  type Feature,
} from "@/engine/tiers/entitlements";

/**
 * Server-rendered feature-gate panel. Shown in place of a premium surface when
 * the viewer's tier doesn't unlock `feature`.
 */
export function Paywall({
  feature,
  title,
  blurb,
}: {
  feature: Feature;
  title?: string;
  blurb?: string;
}) {
  const required = minimumTierFor(feature);
  const def = required ? TIERS[required] : null;
  const price = def?.monthlyPriceUsd ? `$${def.monthlyPriceUsd}/mo` : "";

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-[var(--border)] bg-white p-10 text-center shadow-sm">
      <span className="text-2xl" aria-hidden>
        🔒
      </span>
      <h3 className="text-lg font-bold">{title ?? def?.label ?? "Premium feature"}</h3>
      <p className="max-w-sm text-sm text-slate-500">
        {blurb ??
          "Unlock the automated protocol scanner, strict Strat-sniper filters, and high-velocity volatility gates."}
      </p>
      {def && (
        <span className="mt-1 rounded-lg bg-brand-up px-5 py-2.5 text-sm font-bold text-white">
          Upgrade to {def.label}
          {price ? ` — ${price}` : ""}
        </span>
      )}
    </div>
  );
}

export default Paywall;

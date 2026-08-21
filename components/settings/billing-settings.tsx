"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CreditCard } from "lucide-react";
import type { PlatformTier } from "@/lib/tiers";
import { fetchWithTimeout } from "@/lib/utils";

type Status = {
  enabled: boolean;
  tier: PlatformTier;
  tierMeta: Record<PlatformTier, { label: string; monthlyUsd: number; yearlyUsd?: number }>;
};

const UPGRADE_TIERS: PlatformTier[] = ["INVESTOR_MODE", "SYSTEM_MASTERY"];

export function BillingSettings() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busyTier, setBusyTier] = useState<PlatformTier | "manage" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchWithTimeout("/api/billing/status")
      .then((res) => res.json())
      .then(setStatus)
      .catch(() => setError("Couldn't load billing status."));
  }, []);

  async function upgrade(tier: PlatformTier) {
    setError(null);
    setBusyTier(tier);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, interval: "monthly" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Checkout failed");
      window.location.assign(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
      setBusyTier(null);
    }
  }

  async function manageBilling() {
    setError(null);
    setBusyTier("manage");
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't open billing portal");
      window.location.assign(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't open billing portal");
      setBusyTier(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-accent" /> Plan &amp; billing
        </CardTitle>
        <CardDescription>
          {status ? (
            <>
              Current plan: <Badge>{status.tierMeta[status.tier]?.label ?? status.tier}</Badge>
            </>
          ) : error ? (
            error
          ) : (
            "Loading…"
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {status && !status.enabled && (
          <p className="text-sm text-muted">
            Billing isn&apos;t configured yet — upgrades aren&apos;t available in this environment.
          </p>
        )}

        {status?.enabled && (
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {UPGRADE_TIERS.filter((t) => t !== status.tier).map((tier) => (
              <Button
                key={tier}
                variant="outline"
                disabled={busyTier !== null}
                onClick={() => upgrade(tier)}
              >
                {busyTier === tier
                  ? "Redirecting…"
                  : `Upgrade to ${status.tierMeta[tier].label} — $${status.tierMeta[tier].monthlyUsd}/mo`}
              </Button>
            ))}
            <Button variant="outline" disabled={busyTier !== null} onClick={manageBilling}>
              {busyTier === "manage" ? "Opening…" : "Manage billing"}
            </Button>
          </div>
        )}

        {error && status && <p className="text-sm text-bear">{error}</p>}
      </CardContent>
    </Card>
  );
}

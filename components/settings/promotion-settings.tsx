"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle, TrendingUp } from "lucide-react";
import { NEUTRAL_UPGRADE_PROMPT } from "@/lib/promotion/copy";
import type { PromotionRequirementResult } from "@/lib/promotion/eligibility";

interface StatusResponse {
  tier: string;
  promoted: boolean;
  eligible: boolean | null;
  requirements: PromotionRequirementResult[];
  requestedAt: string | null;
  effectiveAt: string | null;
}

/**
 * Pro (STANDARD) tier-promotion readiness, shown only for a Novice
 * (PRACTICE) account. Never appears alongside — and never phrases anything
 * as a response to — a loss, cooldown, or risk lock; it is a standalone
 * status card a user checks on their own, matching the spec pack's
 * "Required wording" rule that an upgrade nudge must stay neutral.
 */
export function PromotionSettings() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/promotion/status")
      .then((res) => res.json())
      .then((body: StatusResponse) => !cancelled && setStatus(body))
      .catch(() => !cancelled && setError("Couldn't load tier-promotion status."));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!status || status.tier !== "PRACTICE") return null;

  async function requestUpgrade() {
    setRequesting(true);
    setError(null);
    try {
      const res = await fetch("/api/promotion/upgrade", { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Not yet eligible.");
        return;
      }
      setStatus((prev) => (prev ? { ...prev, requestedAt: new Date().toISOString(), effectiveAt: body.effectiveAt } : prev));
    } catch {
      setError("Couldn't submit the upgrade request.");
    } finally {
      setRequesting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-accent" /> Pro tier progress
        </CardTitle>
        <CardDescription>
          {status.eligible ? NEUTRAL_UPGRADE_PROMPT : "Your progress toward Pro-tier eligibility."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ul className="flex flex-col gap-2">
          {status.requirements.map((req) => (
            <li key={req.key} className="flex items-start gap-2 text-sm">
              {req.met ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-bull" />
              ) : (
                <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
              )}
              <span className={req.met ? "text-foreground" : "text-muted"}>{req.label}</span>
            </li>
          ))}
        </ul>

        {status.effectiveAt ? (
          <Badge variant="muted">
            Upgrade scheduled — takes effect at the next session ({new Date(status.effectiveAt).toLocaleString()})
          </Badge>
        ) : (
          <Button onClick={requestUpgrade} disabled={!status.eligible || requesting} className="self-start">
            {requesting ? "Requesting…" : "Request Pro upgrade"}
          </Button>
        )}

        {error && <p className="text-sm text-bear">{error}</p>}
      </CardContent>
    </Card>
  );
}

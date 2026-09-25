"use client";

/**
 * Tier Promotion — the three-path model (Curriculum / Track Record /
 * Pay-to-play), any one of which independently clears a profile's next
 * tier transition. See `lib/promotion/paths.ts` and AGENTS.md's
 * "Three-path tier promotion" section.
 *
 * Copy here follows `lib/promotion/copy.ts`'s existing forbidden-phrase
 * rule (no "guaranteed", "best trade", "safe", etc.) — the ascension
 * framing the project owner asked for ("a genuine graduation out of
 * constraints appropriate to a lower stage") is expressed through what a
 * tier's constraints actually were and now aren't, never through a
 * performance claim.
 */

import { useEffect, useState } from "react";
import { CheckCircle2, Circle, GraduationCap, LineChart, CreditCard, ArrowUpCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TRANSITION_LABELS, PATH_LABELS, type PromotionPath, type TierTransition } from "@/lib/promotion/transitions";

interface RequirementResult {
  key: string;
  met: boolean;
  label: string;
}

interface TrackRecordEligibility {
  eligible: boolean;
  requirements: RequirementResult[];
}

interface PathsResult {
  transition: TierTransition;
  mandatoryComponentMet: boolean;
  curriculumEligible: boolean;
  trackRecord: TrackRecordEligibility;
  payToPlayPurchased: boolean;
  eligiblePaths: PromotionPath[];
  eligible: boolean;
}

interface StatusResponse {
  tier: string;
  transition: TierTransition | null;
  promoted: boolean;
  paths: PathsResult | null;
  requestedAt: string | null;
  effectiveAt: string | null;
  pricing: {
    proposal: { amountCents: number; subscriptionStillRequired: boolean };
    billingEnabled: boolean;
  } | null;
}

export default function PromotionPage() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState<PromotionPath | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/promotion/paths/status")
      .then((res) => res.json())
      .then((body: StatusResponse) => !cancelled && setStatus(body))
      .catch(() => !cancelled && setError("Couldn't load tier-promotion status."));
    return () => {
      cancelled = true;
    };
  }, []);

  async function requestUpgrade(path: PromotionPath) {
    if (!status?.transition) return;
    setRequesting(path);
    setError(null);
    try {
      const res = await fetch("/api/promotion/paths/upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transition: status.transition, path }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Not yet eligible.");
        return;
      }
      setStatus((prev) => (prev ? { ...prev, requestedAt: new Date().toISOString(), effectiveAt: body.effectiveAt } : prev));
    } catch {
      setError("Couldn't submit the upgrade request.");
    } finally {
      setRequesting(null);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-4 sm:gap-6">
      <div>
        <h1 className="text-xl font-semibold sm:text-2xl">Tier Promotion</h1>
        <p className="text-sm text-muted">
          Three independent ways to reach the next tier. Any one is sufficient on its own — none is
          required to clear the others.
        </p>
      </div>

      {error && (
        <Card>
          <CardContent className="py-6 text-sm text-bear">{error}</CardContent>
        </Card>
      )}

      {!status && !error && <p className="text-sm text-muted">Loading…</p>}

      {status && !status.transition && (
        <Card>
          <CardContent className="py-6 text-sm text-muted">
            No further tier promotion is available from your current tier.
          </CardContent>
        </Card>
      )}

      {status?.transition && status.paths && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowUpCircle className="h-4 w-4 text-accent" />
                {TRANSITION_LABELS[status.transition]}
              </CardTitle>
              <CardDescription>
                {status.effectiveAt
                  ? `Scheduled — takes effect at the next session (${new Date(status.effectiveAt).toLocaleString()}).`
                  : "The constraints on your current tier lift once any one path below clears — none of the three requires the other two."}
              </CardDescription>
            </CardHeader>
          </Card>

          {!status.paths.mandatoryComponentMet && (
            <Card>
              <CardContent className="py-4 text-sm text-warn">
                This transition requires completing the live-trading risk education module first — every
                path below is held until that&apos;s done.
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <PathCard
              icon={<GraduationCap className="h-4 w-4" />}
              path="curriculum"
              eligible={status.paths.curriculumEligible}
              mandatoryOk={status.paths.mandatoryComponentMet}
              description="Complete the required GSPS School curriculum for this tier."
              requesting={requesting === "curriculum"}
              onRequest={() => requestUpgrade("curriculum")}
              scheduled={Boolean(status.effectiveAt)}
              cta={
                <a href="/school" className="text-sm font-medium text-accent underline underline-offset-2">
                  Go to GSPS School →
                </a>
              }
            />
            <PathCard
              icon={<LineChart className="h-4 w-4" />}
              path="track_record"
              eligible={status.paths.trackRecord.eligible}
              mandatoryOk={status.paths.mandatoryComponentMet}
              description="Demonstrate a qualifying trading track record over the evaluation window."
              requesting={requesting === "track_record"}
              onRequest={() => requestUpgrade("track_record")}
              scheduled={Boolean(status.effectiveAt)}
            >
              <ul className="flex flex-col gap-1.5">
                {status.paths.trackRecord.requirements.map((req) => (
                  <li key={req.key} className="flex items-start gap-2 text-xs">
                    {req.met ? (
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-bull" />
                    ) : (
                      <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" />
                    )}
                    <span className={req.met ? "text-foreground" : "text-muted"}>{req.label}</span>
                  </li>
                ))}
              </ul>
            </PathCard>
            <PathCard
              icon={<CreditCard className="h-4 w-4" />}
              path="pay_to_play"
              eligible={status.paths.eligiblePaths.includes("pay_to_play")}
              mandatoryOk={status.paths.mandatoryComponentMet}
              description="Pay a one-time fee to skip the curriculum and track-record requirements."
              requesting={requesting === "pay_to_play"}
              onRequest={() => requestUpgrade("pay_to_play")}
              scheduled={Boolean(status.effectiveAt)}
            >
              {status.pricing && (
                <div className="flex flex-col gap-1 text-xs text-muted">
                  <span>
                    Proposed fee: ${(status.pricing.proposal.amountCents / 100).toLocaleString()}
                    {status.pricing.proposal.subscriptionStillRequired ? " + the standard subscription" : ""}
                  </span>
                  {!status.pricing.billingEnabled && (
                    <Badge variant="muted" className="w-fit">
                      Not yet available
                    </Badge>
                  )}
                </div>
              )}
            </PathCard>
          </div>
        </>
      )}
    </div>
  );
}

function PathCard({
  icon,
  path,
  eligible,
  mandatoryOk,
  description,
  requesting,
  onRequest,
  scheduled,
  cta,
  children,
}: {
  icon: React.ReactNode;
  path: PromotionPath;
  eligible: boolean;
  mandatoryOk: boolean;
  description: string;
  requesting: boolean;
  onRequest: () => void;
  scheduled: boolean;
  cta?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {icon}
          {PATH_LABELS[path]}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {children}
        {cta}
        {scheduled ? (
          <Badge variant="muted">Scheduled via another path</Badge>
        ) : (
          <Button
            onClick={onRequest}
            disabled={!eligible || !mandatoryOk || requesting}
            variant={eligible && mandatoryOk ? "default" : "outline"}
            className="self-start"
          >
            {requesting ? "Requesting…" : eligible ? "Promote via this path" : "Not yet eligible"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

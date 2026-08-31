"use client";

/**
 * Wall-Street-only, plan-scoped GSPS Automation — distinct from
 * AutomationControlPanel's fully-autonomous "Automated Portfolio Manager"
 * above it on this page. A member picks one already entry-confirmed
 * candidate plan and deliberately activates paper or live automation
 * against it; the server resolves every order term from the plan
 * (lib/automation/service.ts) — this component only ever sends
 * `planId`/`automationMode`/`executionMode`/`configuration.allocatedDollarRisk`.
 */

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface EligiblePlanSummary {
  planId: string;
  instrument: string;
  direction: "bullish" | "bearish";
  state: string;
  entryTrigger: number;
  invalidation: number;
  takeProfit1: number;
}

export interface AutomationProfileSummary {
  profile_id: string;
  plan_id: string;
  automation_mode: "system_plan" | "guided_custom";
  execution_mode: "paper" | "live";
  status: "active" | "paused" | "stopped" | "completed";
  configuration: { allocatedDollarRisk: number };
}

export function GspsPlanAutomation({
  eligiblePlans,
  profiles,
}: {
  eligiblePlans: EligiblePlanSummary[];
  profiles: AutomationProfileSummary[];
}) {
  const automatedPlanIds = new Set(profiles.map((p) => p.plan_id));
  const openPlans = eligiblePlans.filter((p) => !automatedPlanIds.has(p.planId));

  return (
    <Card data-tour="gsps-plan-automation">
      <CardHeader>
        <CardTitle>GSPS Automation</CardTitle>
        <CardDescription>
          Activate paper or live automation against one specific, already entry-confirmed GSPS
          candidate plan. Every plan below is{" "}
          <span className="font-medium">system-generated — not an execution instruction</span>{" "}
          until you deliberately activate it.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div>
          <h3 className="mb-2 text-sm font-semibold">Eligible candidate plans</h3>
          {openPlans.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted">
              No entry-confirmed candidate plans awaiting automation right now.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {openPlans.map((plan) => (
                <EligiblePlanRow key={plan.planId} plan={plan} />
              ))}
            </div>
          )}
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold">Active automation profiles</h3>
          {profiles.length === 0 ? (
            <p className="text-sm text-muted">No automation profiles yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {profiles.map((profile) => (
                <ProfileRow key={profile.profile_id} profile={profile} />
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function EligiblePlanRow({ plan }: { plan: EligiblePlanSummary }) {
  const [expanded, setExpanded] = useState(false);
  const [allocatedDollarRisk, setAllocatedDollarRisk] = useState("500");
  const [executionMode, setExecutionMode] = useState<"paper" | "live">("paper");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activated, setActivated] = useState(false);

  async function activate() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/automation/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: plan.planId,
          automationMode: "system_plan",
          executionMode,
          configuration: { allocatedDollarRisk: Number(allocatedDollarRisk) },
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Activation failed.");
        return;
      }
      setActivated(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Activation failed.");
    } finally {
      setSubmitting(false);
    }
  }

  if (activated) {
    return (
      <div className="rounded-lg border border-border bg-background px-4 py-3 text-sm text-muted">
        Automation activated for {plan.instrument}.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold">{plan.instrument}</span>
          <Badge variant={plan.direction === "bullish" ? "bull" : "bear"}>
            {plan.direction === "bullish" ? "Long" : "Short"}
          </Badge>
          <Badge variant="muted">{plan.state}</Badge>
        </div>
        <Button size="sm" variant="outline" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Cancel" : "Activate"}
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted">
        Entry {plan.entryTrigger} · Stop {plan.invalidation} · TP1 {plan.takeProfit1}
      </p>

      {expanded && (
        <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Mode</label>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={executionMode === "paper" ? "default" : "outline"}
                onClick={() => setExecutionMode("paper")}
              >
                Paper
              </Button>
              <Button
                size="sm"
                variant={executionMode === "live" ? "destructive" : "outline"}
                onClick={() => setExecutionMode("live")}
              >
                Live
              </Button>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">
              Allocated dollar risk for this trade
            </label>
            <Input
              type="number"
              min={1}
              value={allocatedDollarRisk}
              onChange={(e) => setAllocatedDollarRisk(e.target.value)}
            />
          </div>
          {executionMode === "live" && (
            <p className="rounded border border-warn/40 bg-warn-soft px-3 py-2 text-xs text-warn">
              Live mode submits a real broker order once activated. Execution mode cannot be
              changed after activation.
            </p>
          )}
          {error && <p className="text-xs text-bear">{error}</p>}
          <Button size="sm" onClick={activate} disabled={submitting}>
            {submitting ? "Activating…" : `Activate ${executionMode}`}
          </Button>
        </div>
      )}
    </div>
  );
}

function ProfileRow({ profile }: { profile: AutomationProfileSummary }) {
  const [status, setStatus] = useState(profile.status);
  const [busy, setBusy] = useState(false);

  async function act(action: "pause" | "stop") {
    setBusy(true);
    try {
      const res = await fetch(`/api/automation/profiles/${profile.profile_id}/${action}`, { method: "POST" });
      if (res.ok) setStatus(action === "pause" ? "paused" : "stopped");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-4 py-3 text-sm">
      <div className="flex items-center gap-2">
        <Badge variant={profile.execution_mode === "live" ? "bear" : "muted"}>
          {profile.execution_mode}
        </Badge>
        <Badge variant="muted">{status}</Badge>
        <span className="text-muted">${profile.configuration.allocatedDollarRisk} allocated</span>
      </div>
      {status === "active" && (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => act("pause")}>
            Pause
          </Button>
          <Button size="sm" variant="destructive" disabled={busy} onClick={() => act("stop")}>
            Stop
          </Button>
        </div>
      )}
      {status === "paused" && (
        <Button size="sm" variant="destructive" disabled={busy} onClick={() => act("stop")}>
          Stop
        </Button>
      )}
    </div>
  );
}

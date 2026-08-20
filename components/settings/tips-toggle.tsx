"use client";

/**
 * GSPS — the single switch that turns Mrs. Bull and Mr. Bear off.
 *
 * Clippy's real crime was not existing; it was being unkillable. Someone who
 * does not want contextual hints must be able to end all of them in one action,
 * from somewhere obvious, without dismissing five separately and without
 * finding out later that a sixth exists.
 *
 * Turning them back on restores only tips that were never individually
 * dismissed — a dismissal is a decision about that tip, and the global switch
 * is a decision about the feature. Conflating them would resurrect hints the
 * user has already said no to.
 */

import * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mascot } from "@/components/onboarding/mascots";
import { TIPS_DEFAULT, type TipState } from "@/lib/onboarding/status";

export function TipsToggle() {
  const [state, setState] = React.useState<TipState | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetch("/api/onboarding/tips")
      .then((res) => (res.ok ? (res.json() as Promise<TipState>) : TIPS_DEFAULT))
      .then(setState)
      .catch(() => setState(TIPS_DEFAULT));
  }, []);

  async function setEnabled(enabled: boolean) {
    setSaving(true);
    setError(null);
    // Optimistic, then reconciled from the response: the control has to feel
    // immediate, and a failure puts the old value back rather than leaving the
    // switch showing a state the server never accepted.
    const previous = state;
    setState((s) => (s ? { ...s, enabled } : s));
    try {
      const res = await fetch("/api/onboarding/tips", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Could not save that.");
      setState((await res.json()) as TipState);
    } catch (err) {
      setState(previous);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const enabled = state?.enabled ?? true;
  const dismissedCount = state?.dismissed.length ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mascot name="bull" size="sm" />
          <Mascot name="bear" size="sm" />
          Tips from Mrs. Bull and Mr. Bear
        </CardTitle>
        <CardDescription>
          Short explanations that appear next to a control the first time you meet it. Each one can be
          dismissed on the spot, and dismissing it is permanent.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={() => void setEnabled(!enabled)}
            disabled={saving || state === null}
            variant={enabled ? "outline" : "default"}
          >
            {enabled ? "Turn tips off" : "Turn tips on"}
          </Button>
          <p className="text-sm text-muted">
            {state === null
              ? "Checking…"
              : enabled
                ? dismissedCount > 0
                  ? `On. You've dismissed ${dismissedCount} of them.`
                  : "On."
                : "Off. No tips will appear anywhere."}
          </p>
        </div>
        {error && <p className="text-sm text-bear">{error}</p>}
      </CardContent>
    </Card>
  );
}

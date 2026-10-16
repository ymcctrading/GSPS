"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchWithTimeout } from "@/lib/utils";
import { DEFAULT_GUIDED_CAPS, MAX_RISK_PCT, MIN_RISK_PCT, type GuidedCaps } from "@/lib/guided/config";
import { CAPITAL_POINTS_PER_SHARE, MAX_OPEN_STOCKS } from "@/lib/risk/gannCapital";

type Draft = Record<keyof GuidedCaps, string>;

const FIELDS: {
  key: keyof GuidedCaps;
  label: string;
  hint: string;
  step: string;
  min: number;
  max: number;
}[] = [
  {
    key: "riskPct",
    label: "Risk per trade (% of equity)",
    hint: "Sets the share count: this much of your paper equity, divided by the distance from entry to stop.",
    step: "0.25",
    min: MIN_RISK_PCT,
    max: MAX_RISK_PCT,
  },
];

/**
 * The Guided Mode caps, editable.
 *
 * The per-trade risk percent is the one limit a user sets. The capital rules
 * (30 points of capital a share, at most five stocks) are shown, not edited:
 * they are the method's, the same on every order path (Q12, 2026-10-16). The
 * risk bounds are refused by the API too, not only by this form.
 */
export function GuidedCapsForm() {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchWithTimeout("/api/settings/guided")
      .then((res) => res.json())
      .then((body: { caps?: GuidedCaps }) => {
        if (cancelled) return;
        setDraft(toDraft(body.caps ?? DEFAULT_GUIDED_CAPS));
      })
      .catch(() => {
        if (cancelled) return;
        // Fall back to the defaults so the form is still usable, but flag it
        // — these may not be the limits actually saved for this account.
        setLoadError(true);
        setDraft(toDraft(DEFAULT_GUIDED_CAPS));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    if (!draft) return;
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/settings/guided", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          riskPct: Number(draft.riskPct),
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setFeedback({ ok: false, text: body.error ?? `HTTP ${res.status}` });
        return;
      }
      setDraft(toDraft(body.caps as GuidedCaps));
      setFeedback({ ok: true, text: "Saved. New recommendations use these limits." });
    } catch (err) {
      setFeedback({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card data-tour="settings-caps">
      <CardHeader>
        <CardTitle>Guided Mode limits</CardTitle>
        <CardDescription>
          What Guided Mode is allowed to commit on your behalf. Ships conservative; every
          recommendation is sized against these and refused when one is reached.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {draft === null ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : (
          <>
            {loadError && (
              <p className="text-sm text-bear">
                Couldn&apos;t load your saved limits — showing defaults instead. Saving will overwrite
                whatever was previously set.
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              {FIELDS.map((f) => (
                <label key={f.key} className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium">{f.label}</span>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step={f.step}
                    min={f.min}
                    max={f.max}
                    value={draft[f.key]}
                    onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                  />
                  <span className="text-xs text-muted">{f.hint}</span>
                </label>
              ))}
            </div>
            <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-background px-4 py-3 text-sm">
              <span className="font-medium">Capital rules</span>
              <span className="text-xs text-muted">
                Every share held needs capital behind it: {CAPITAL_POINTS_PER_SHARE} points a share, scaled to
                the stock&apos;s price. At most {MAX_OPEN_STOCKS} stocks are open at once, and three losses in a
                row pause new entries for that day and the next. These are the method&apos;s rules, the same on
                every order, so they are not settings.
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => void save()} disabled={saving}>
                {saving ? "Saving…" : "Save limits"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setDraft(toDraft(DEFAULT_GUIDED_CAPS))}
                disabled={saving}
              >
                Reset to defaults
              </Button>
              {feedback && (
                <span className={feedback.ok ? "text-sm text-bull" : "text-sm text-bear"}>
                  {feedback.text}
                </span>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function toDraft(caps: GuidedCaps): Draft {
  return { riskPct: String(caps.riskPct) };
}

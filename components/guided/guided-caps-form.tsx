"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DEFAULT_GUIDED_BUDGET_USD,
  DEFAULT_GUIDED_CAPS,
  MAX_GUIDED_BUDGET_USD,
  MAX_RISK_PCT,
  MIN_GUIDED_BUDGET_USD,
  MIN_RISK_PCT,
  type GuidedCaps,
} from "@/lib/guided/config";

// budgetUsd stays a plain numeric string, same as every other field — the
// on/off state lives in `budgetEnabled` instead of being inferred from an
// empty string, because the input has to survive being cleared mid-edit
// (select-all-and-retype) without the field itself disappearing under the
// user's cursor. It is kept out of the generic FIELDS loop below and
// rendered with its own checkbox.
type Draft = Record<keyof GuidedCaps, string> & { budgetEnabled: boolean };

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
  {
    key: "maxTradesPerDay",
    label: "New positions per day",
    hint: "Counted in Eastern trading days, and only against trades opened through Guided Mode.",
    step: "1",
    min: 1,
    max: 20,
  },
  {
    key: "maxTradesPerWeek",
    label: "New positions per rolling week",
    hint: "The last seven days, not the calendar week.",
    step: "1",
    min: 1,
    max: 50,
  },
  {
    key: "maxDeployedPct",
    label: "Most equity deployed at once (%)",
    hint: "Across all open guided positions together. Per-trade risk caps what one trade can lose; this caps what the mode can tie up.",
    step: "5",
    min: 5,
    max: 100,
  },
];

/**
 * The Guided Mode caps, editable.
 *
 * Every limit the mode enforces is here, because a cap the user cannot see or
 * change is the app quietly deciding for them. What is *not* here is a way to
 * turn any of them off — the bounds on each field are the range Guided Mode is
 * willing to honour, and a value outside it is refused by the API too, not only
 * by this form.
 */
export function GuidedCapsForm() {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings/guided")
      .then((res) => res.json())
      .then((body: { caps?: GuidedCaps }) => {
        if (cancelled) return;
        setDraft(toDraft(body.caps ?? DEFAULT_GUIDED_CAPS));
      })
      .catch(() => !cancelled && setDraft(toDraft(DEFAULT_GUIDED_CAPS)));
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
          maxTradesPerDay: Number(draft.maxTradesPerDay),
          maxTradesPerWeek: Number(draft.maxTradesPerWeek),
          maxDeployedPct: Number(draft.maxDeployedPct),
          budgetUsd: draft.budgetEnabled ? Number(draft.budgetUsd) : null,
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
              <label className="flex items-center gap-2 font-medium">
                <input
                  type="checkbox"
                  checked={draft.budgetEnabled}
                  onChange={(e) => setDraft({ ...draft, budgetEnabled: e.target.checked })}
                />
                Cap each trade to a dollar budget
              </label>
              <span className="text-xs text-muted">
                For accounts trading with real money in the low hundreds: no recommendation will
                ever cost more than this, however much the risk percentage above would otherwise
                size it to. On by default, because the percentage caps alone are sized against
                paper equity that can be far larger than what you actually have to spend.
              </span>
              {draft.budgetEnabled && (
                <Input
                  type="number"
                  inputMode="decimal"
                  step="10"
                  min={MIN_GUIDED_BUDGET_USD}
                  max={MAX_GUIDED_BUDGET_USD}
                  value={draft.budgetUsd}
                  onChange={(e) => setDraft({ ...draft, budgetUsd: e.target.value })}
                  className="max-w-40"
                />
              )}
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
  return {
    riskPct: String(caps.riskPct),
    maxTradesPerDay: String(caps.maxTradesPerDay),
    maxTradesPerWeek: String(caps.maxTradesPerWeek),
    maxDeployedPct: String(caps.maxDeployedPct),
    // A remembered numeric value even while off, so re-checking the box does
    // not reset a figure the user already chose.
    budgetUsd: String(caps.budgetUsd ?? DEFAULT_GUIDED_BUDGET_USD),
    budgetEnabled: caps.budgetUsd != null,
  };
}

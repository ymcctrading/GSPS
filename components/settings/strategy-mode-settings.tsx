"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  NON_GANN_STRATEGY_MODES,
  STRATEGY_MODE_LABELS,
  type StrategyModeId,
} from "@/lib/strategies/types";

/**
 * Default Strategy Mode (AGENTS.md's "Strategy Modes" section;
 * docs/STRATEGY_MODES.md) — an opt-in, non-default alternative to GSPS's own
 * Gann-grounded trade plan, for a user actively trading a specific
 * technique (PSAR+Supertrend, Sara Strat bar patterns, etc.) who wants
 * entry/stop/target levels priced that way instead. This setting only
 * changes what the order ticket/chart *default to* pre-selecting — it never
 * touches scanning, scoring, SignalGates, or Automation, all of which remain
 * Gann-only regardless of this setting. "Gann (default)" is always
 * available and is what a new account starts on.
 */
export function StrategyModeSettings() {
  const [mode, setMode] = useState<StrategyModeId | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/strategy-mode-preference")
      .then((res) => res.json())
      .then((body: { mode?: StrategyModeId; error?: string }) => {
        if (cancelled) return;
        if (body.error) setError(body.error);
        else setMode(body.mode ?? "gann");
      })
      .catch(() => !cancelled && setError("Couldn't load your Strategy Mode preference."));
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(next: StrategyModeId) {
    setSaving(true);
    setError(null);
    const prev = mode;
    setMode(next); // optimistic
    try {
      const res = await fetch("/api/strategy-mode-preference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: next }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't save.");
    } catch (err) {
      setMode(prev);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Strategy mode</CardTitle>
        <CardDescription>
          GSPS prices every trade plan from its own structural analysis by default. If you
          actively trade a different technique, pick it here to have the order ticket also offer
          entry/stop/target levels priced that way — one at a time, and always shown separately
          from GSPS&apos;s own structural trade plan. You can still override it per ticket.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <select
          className="w-full rounded-md border px-3 py-2 text-sm bg-background"
          value={mode ?? "gann"}
          disabled={mode === null || saving}
          onChange={(e) => save(e.target.value as StrategyModeId)}
        >
          <option value="gann">{STRATEGY_MODE_LABELS.gann}</option>
          {NON_GANN_STRATEGY_MODES.map((m) => (
            <option key={m} value={m}>
              {STRATEGY_MODE_LABELS[m]}
            </option>
          ))}
        </select>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}

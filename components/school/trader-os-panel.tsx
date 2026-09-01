"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface TraderOS {
  objective: string | null;
  pause_conditions: string[] | null;
  pre_trade_falsification_prompt: string | null;
}

/**
 * The Trader Operating System — a private, editable learner baseline. This
 * is a process/discipline tool only, never diagnostic: it collects no
 * clinical or mental-health data, only an objective, pause conditions, and
 * a pre-trade falsification prompt written in the learner's own words.
 */
export function TraderOsPanel() {
  const [data, setData] = useState<TraderOS | null>(null);
  const [objective, setObjective] = useState("");
  const [pauseConditions, setPauseConditions] = useState("");
  const [falsificationPrompt, setFalsificationPrompt] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/school/trader-os")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!json?.traderOS) return;
        setData(json.traderOS);
        setObjective(json.traderOS.objective ?? "");
        setPauseConditions((json.traderOS.pause_conditions ?? []).join("\n"));
        setFalsificationPrompt(json.traderOS.pre_trade_falsification_prompt ?? "");
      })
      .catch(() => {});
  }, []);

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/school/trader-os", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objective,
          pauseConditions: pauseConditions.split("\n").map((s) => s.trim()).filter(Boolean),
          preTradeFalsificationPrompt: falsificationPrompt,
        }),
      });
      if (res.ok) setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Trader Operating System</CardTitle>
        <CardDescription>
          A private, editable baseline for your own process — not a diagnostic tool, and not visible to anyone but you.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Objective</span>
          <textarea
            className="min-h-16 rounded-lg border border-border bg-background p-2 text-sm"
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            placeholder="What are you actually trying to build discipline toward?"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Pause conditions (one per line)</span>
          <textarea
            className="min-h-16 rounded-lg border border-border bg-background p-2 text-sm"
            value={pauseConditions}
            onChange={(e) => setPauseConditions(e.target.value)}
            placeholder="e.g. Three losing trades in a row: stop and review"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Pre-trade falsification prompt</span>
          <textarea
            className="min-h-16 rounded-lg border border-border bg-background p-2 text-sm"
            value={falsificationPrompt}
            onChange={(e) => setFalsificationPrompt(e.target.value)}
            placeholder="The question you ask yourself before every entry to try to prove yourself wrong."
          />
        </label>
        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
          {saved && <span className="text-xs text-bull">Saved.</span>}
        </div>
        {data?.pre_trade_falsification_prompt == null && !data && (
          <p className="text-xs text-muted">Nothing saved yet — this is entirely optional and private.</p>
        )}
      </CardContent>
    </Card>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShieldAlert } from "lucide-react";

interface Status {
  state: string;
  reason: string | null;
  due: boolean;
}

const TEXTAREA =
  "min-h-20 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-accent";

/**
 * The reset checklist (app/api/risk/reset-checklist), shown only while one is
 * due: after a hard cooldown or a lock, new entries wait for it. The study
 * after a series of losses, written down before trading again. Closing a
 * position is never held by it.
 */
export function RiskResetChecklist() {
  const [status, setStatus] = useState<Status | null>(null);
  const [accountValue, setAccountValue] = useState("");
  const [openRisk, setOpenRisk] = useState("");
  const [ruleBreach, setRuleBreach] = useState("");
  const [correlation, setCorrelation] = useState("");
  const [plan, setPlan] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/risk/reset-checklist")
      .then((r) => (r.ok ? r.json() : null))
      .then((s: Status | null) => {
        if (!cancelled) setStatus(s);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!status?.due) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/risk/reset-checklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountValue: Number(accountValue),
          currentOpenRiskUsd: Number(openRisk),
          ruleBreach: ruleBreach.trim() === "" ? null : ruleBreach,
          correlationExposure: correlation,
          revisedPlan: plan,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setStatus({ ...(status as Status), due: false });
        return;
      }
      setMessage(body.error ?? "The checklist wasn't saved.");
    } catch {
      setMessage("The checklist wasn't saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-bear" /> Reset checklist
        </CardTitle>
        <CardDescription>
          {status.reason ?? "Your account is in a cooldown."} New entries resume once this is complete and any
          hold still running has ended. Closing or protecting a position is never held.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-3 text-sm">
          <label className="flex flex-col gap-1">
            Account value today ($)
            <Input type="number" min="0" step="0.01" required value={accountValue} onChange={(e) => setAccountValue(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            Dollars at risk in open positions, stop to entry ($)
            <Input type="number" min="0" step="0.01" required value={openRisk} onChange={(e) => setOpenRisk(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            Which rule was broken, if any (leave empty if none)
            <textarea className={TEXTAREA} value={ruleBreach} onChange={(e) => setRuleBreach(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            How many of your positions move together, and in which markets
            <textarea className={TEXTAREA} required value={correlation} onChange={(e) => setCorrelation(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            What you will do differently on the next trade
            <textarea className={TEXTAREA} required value={plan} onChange={(e) => setPlan(e.target.value)} />
          </label>
          <div>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Complete checklist"}
            </Button>
          </div>
          {message && <p className="text-xs text-bear">{message}</p>}
        </form>
      </CardContent>
    </Card>
  );
}

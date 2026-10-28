"use client";

/**
 * The twice-yearly "close everything and rest" reminder (lib/gann/traderPrefs.ts).
 * Shows only inside a rest window, when switched on and not yet dismissed for
 * this half-year. Also the close-out reminder in the days before a set absence
 * (A-EXIT-05). Nothing is closed for the trader unless they tap "Close all
 * positions" and confirm it (M-K4; owner's Q16, "Button"), which closes every
 * open paper position at market through `/api/positions/close-all`.
 */

import { useState } from "react";
import { useTradeRulePrefs } from "@/components/gann/use-gann-rule-prefs";

function CloseAllButton() {
  const [step, setStep] = useState<"idle" | "confirm" | "busy" | "done">("idle");
  const [message, setMessage] = useState<string | null>(null);
  async function closeAll() {
    setStep("busy");
    try {
      const res = await fetch("/api/positions/close-all", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { closed?: string[]; failed?: { symbol: string }[]; error?: string };
      if (!res.ok && res.status !== 207) {
        setMessage(body.error ?? "Couldn't close your positions. Nothing more was changed.");
      } else {
        const closed = body.closed?.length ?? 0;
        const failed = body.failed?.map((f) => f.symbol) ?? [];
        setMessage(
          closed === 0 && failed.length === 0
            ? "You have no open paper positions."
            : `Closed ${closed} paper position${closed === 1 ? "" : "s"} at market.${failed.length ? ` Couldn't close ${failed.join(", ")}; try those from Portfolio.` : ""}`,
        );
      }
    } catch {
      setMessage("Couldn't close your positions. Nothing more was changed.");
    }
    setStep("done");
  }
  if (step === "done") return <p className="text-sm text-muted">{message}</p>;
  if (step === "confirm" || step === "busy") {
    return (
      <span className="flex flex-wrap items-center gap-2">
        <span>Close every open paper position at market?</span>
        <button type="button" className="min-h-9 rounded-md border border-border px-3" disabled={step === "busy"} onClick={() => void closeAll()}>
          {step === "busy" ? "Closing…" : "Yes, close all"}
        </button>
        <button type="button" className="min-h-9 rounded-md px-3 text-muted underline" disabled={step === "busy"} onClick={() => setStep("idle")}>
          Cancel
        </button>
      </span>
    );
  }
  return (
    <button type="button" className="min-h-9 rounded-md border border-border px-3" onClick={() => setStep("confirm")}>
      Close all positions
    </button>
  );
}

export function RestReminder() {
  const { restReminder, awayReminder, save } = useTradeRulePrefs();
  return (
    <>
      {awayReminder && (
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-accent/40 bg-surface p-4" role="note">
          <div className="max-w-prose">
            <p className="text-sm font-medium">Go flat before you&apos;re away</p>
            <p className="mt-1 text-sm text-muted">{awayReminder.message}</p>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <CloseAllButton />
            <button type="button" className="min-h-9 rounded-md border border-border px-3" onClick={() => save({ awayFrom: null })}>
              Dismiss
            </button>
          </div>
        </div>
      )}
      {restReminder && <RestNotice restReminder={restReminder} save={save} />}
    </>
  );
}

function RestNotice({
  restReminder,
  save,
}: {
  restReminder: NonNullable<ReturnType<typeof useTradeRulePrefs>["restReminder"]>;
  save: ReturnType<typeof useTradeRulePrefs>["save"];
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-accent/40 bg-surface p-4" role="note">
      <div className="max-w-prose">
        <p className="text-sm font-medium">Time to rest</p>
        <p className="mt-1 text-sm text-muted">{restReminder.message}</p>
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        <CloseAllButton />
        <button type="button" className="min-h-9 rounded-md border border-border px-3" onClick={() => save({ restDismissedFor: restReminder.period })}>
          Dismiss until next time
        </button>
        <button type="button" className="min-h-9 rounded-md px-3 text-muted underline" onClick={() => save({ restReminder: false })}>
          Turn off
        </button>
      </div>
    </div>
  );
}

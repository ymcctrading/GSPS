"use client";

import { Check, X, Minus } from "lucide-react";
import { isReached, type TargetState, type TargetStatus } from "@/lib/trade/targets";
import { cn } from "@/lib/utils";

/**
 * Three-state target tracker for an order row: TP1, MP and SL.
 *
 * Profit targets mark green when reached, the stop marks red — the colour says
 * what the outcome was, not merely that something happened. A level recorded in
 * the ledger renders solid; one that's only currently through renders outlined,
 * so a live position isn't mistaken for a settled result.
 */
export function TargetStatusCells({ status }: { status: TargetStatus }) {
  return (
    <div className="flex items-center justify-center gap-1">
      <Marker label="TP1" state={status.tp1} tone="bull" />
      <Marker label="MP" state={status.mp} tone="bull" />
      <Marker label="SL" state={status.sl} tone="bear" />
    </div>
  );
}

function Marker({
  label,
  state,
  tone,
}: {
  label: string;
  state: TargetState;
  tone: "bull" | "bear";
}) {
  const reached = isReached(state);
  const recorded = state === "hit";
  const title = `${label}: ${
    {
      hit: "hit",
      reached: "currently through this level",
      pending: "not reached",
      none: "no level set",
    }[state]
  }`;

  return (
    <span
      title={title}
      aria-label={title}
      className={cn(
        "inline-flex h-5 w-9 items-center justify-center gap-0.5 rounded border text-[10px] font-semibold",
        state === "none" && "border-dashed border-border text-muted/50",
        state === "pending" && "border-border text-muted",
        reached && tone === "bull" && (recorded ? "border-bull bg-bull/15 text-bull" : "border-bull text-bull"),
        reached && tone === "bear" && (recorded ? "border-bear bg-bear/15 text-bear" : "border-bear text-bear"),
      )}
    >
      {state === "none" ? (
        <Minus className="h-2.5 w-2.5" />
      ) : reached ? (
        tone === "bull" ? (
          <Check className="h-2.5 w-2.5" />
        ) : (
          <X className="h-2.5 w-2.5" />
        )
      ) : null}
      {label}
    </span>
  );
}

"use client";

import { useEffect, useState } from "react";
import { planQuery } from "@/lib/strategies/explain/params";
import type { PlanInput, PlanReading } from "@/lib/strategies/explain/types";
import type { StrategyModeId } from "@/lib/strategies/types";
import { EXECUTION_TIMEFRAME } from "@/lib/timeframe";
import { cn } from "@/lib/utils";

/**
 * One line explaining GSPS's plan in the person's saved default technique
 * (owner decisions 2026-10-16: explain-only, shown on the setup card and on
 * every other surface that shows a plan's levels). Renders nothing when the
 * person has no default technique, their tier has none, or there is no plan.
 * The levels it reads are the plan's own; it shows no others.
 */

let preference: Promise<StrategyModeId | null> | null = null;

function savedDefaultTechnique(): Promise<StrategyModeId | null> {
  preference ??= fetch("/api/strategy-mode-preference")
    .then((r) => (r.ok ? r.json() : null))
    .then(
      (b: { mode?: StrategyModeId; allowedModes?: StrategyModeId[] } | null) =>
        b?.mode && b.mode !== "gann" && (b.allowedModes ?? []).includes(b.mode)
          ? b.mode
          : null,
    )
    .catch(() => null);
  return preference;
}

/** Test hook: forget the cached preference. */
export function resetPlanReadingCache() {
  preference = null;
}

export function PlanReadingLine({
  symbol,
  plan,
  className,
}: {
  symbol: string;
  plan: PlanInput | null;
  className?: string;
}) {
  const [reading, setReading] = useState<PlanReading | null>(null);
  const [open, setOpen] = useState(false);
  const key = plan ? `${symbol}?${planQuery(plan)}` : null;

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    savedDefaultTechnique().then((mode) => {
      if (!mode || cancelled) return;
      fetch(
        `/api/strategy-levels?symbol=${encodeURIComponent(symbol)}&mode=${mode}&timeframe=${EXECUTION_TIMEFRAME}&${key.split("?")[1]}`,
      )
        .then((r) => (r.ok ? r.json() : null))
        .then((b: { reading?: PlanReading | null } | null) => {
          if (!cancelled) setReading(b?.reading ?? null);
        })
        .catch(() => {
          /* no reading: the line stays hidden */
        });
    });
    return () => {
      cancelled = true;
    };
  }, [key, symbol]);

  if (!plan || !reading) return null;
  return (
    <div className={cn("flex flex-col gap-1 text-xs", className)}>
      <p className={reading.agrees === false ? "text-warn" : "text-muted"}>
        {reading.summary}{" "}
        {reading.levels.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="cursor-pointer font-medium text-accent underline underline-offset-2"
          >
            {open ? "Hide by level" : "By level"}
          </button>
        )}
      </p>
      {open && (
        <ul className="flex flex-col gap-0.5 text-muted">
          {reading.levels.map((l) => (
            <li key={l.level}>{l.text}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { planQuery } from "@/lib/strategies/explain/params";
import type { PlanInput, PlanReading } from "@/lib/strategies/explain/types";
import type { OwnTechniqueLevels } from "@/lib/strategies/compare";
import type { StrategyModeId } from "@/lib/strategies/types";
import { EXECUTION_TIMEFRAME } from "@/lib/timeframe";
import { cn } from "@/lib/utils";

/**
 * One line reading GSPS's plan in the person's saved default technique, shown
 * on the setup card and on every other surface that shows a plan's levels.
 * Renders nothing when the person has no default technique, their tier has
 * none, or there is no plan. Since 2026-10-22 (owner): when the technique
 * doesn't align with the plan, the line also shows the technique's own entry,
 * stop and TP1, never an MTP (`lib/strategies/compare.ts`); when it aligns,
 * it trades the plan and shows no levels of its own.
 */

let preference: Promise<StrategyModeId | null> | null = null;

function savedDefaultTechnique(): Promise<StrategyModeId | null> {
  preference ??= fetch("/api/strategy-mode-preference")
    .then((r) => (r.ok ? r.json() : null))
    .then(
      (b: { mode?: StrategyModeId; allowedModes?: StrategyModeId[] } | null) =>
        b?.mode && b.mode !== "gsps" && (b.allowedModes ?? []).includes(b.mode)
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
  const [own, setOwn] = useState<OwnTechniqueLevels | null>(null);
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
        .then(
          (b: { reading?: PlanReading | null; levels?: OwnTechniqueLevels | null } | null) => {
            if (cancelled) return;
            setReading(b?.reading ?? null);
            setOwn(b?.levels ?? null);
          },
        )
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
      {own && <OwnLevelsLine label={reading.label} own={own} />}
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

const usd = (n: number) => `$${n.toFixed(2)}`;

/** A technique's own trade when it doesn't align with GSPS's plan: entry, stop, TP1, no MTP. */
export function OwnLevelsLine({ label, own }: { label: string; own: OwnTechniqueLevels }) {
  return (
    <p className="text-muted">
      {label}&apos;s own {own.direction === "bullish" ? "long" : "short"}: entry {usd(own.entry)}, stop{" "}
      {usd(own.stopLoss)}, TP1 {usd(own.takeProfit1)}. No MTP, since it doesn&apos;t align with
      GSPS&apos;s plan. Your choice to trade it, from the order ticket.
    </p>
  );
}

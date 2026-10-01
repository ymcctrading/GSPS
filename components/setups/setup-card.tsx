"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Check, ChevronDown, ChevronUp, Minus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, formatUsd } from "@/lib/utils";
import { rewardToRisk, type SetupCardModel, type SetupCheck } from "@/lib/setups/card";

/**
 * The setup card, at the two depths it opens to.
 * -----------------------------------------------------------------------------
 * Project owner direction, 2026-09-30, following the Trade Reviews card: click a
 * setup's name and the card opens halfway — the score and a sentence or two —
 * then expands to everything the chart says about it, and collapses back. The
 * card ends with the same "Open the full scan for …" link Guided Mode uses, so
 * the way from summary to the chart is the same everywhere.
 *
 *   closed  -> the row alone
 *   half    -> headline (score), synopsis, "Show the full card"
 *   full    -> + the four levels, what lined up, higher timeframes, context
 *
 * The component is presentational: the score badge, and anything specific to a
 * surface (the intraday plans, a "Trade this" link), come in as props, so the
 * daily list, the tracked list and the intraday panel share one card without
 * this file knowing about any of them (`lib/setups/card.ts` builds the model).
 */

export type CardStage = "closed" | "half" | "full";

/** Name click opens the card halfway, and closes it from either open depth. */
export function useCardStage(initial: CardStage = "closed") {
  const [stage, setStage] = useState<CardStage>(initial);
  const toggleName = () => setStage((s) => (s === "closed" ? "half" : "closed"));
  return { stage, setStage, toggleName };
}

/**
 * The stock name, as the control that opens its card. A real button with
 * `aria-expanded`, not a link: the way to the chart is the card's own footer.
 */
export function SetupNameButton({
  symbol,
  stage,
  controls,
  onToggle,
  className,
}: {
  symbol: string;
  stage: CardStage;
  controls: string;
  onToggle: () => void;
  className?: string;
}) {
  const open = stage !== "closed";
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={controls}
      title={open ? `Close the ${symbol} card` : `Open the ${symbol} card`}
      className={cn(
        "inline-flex min-h-8 cursor-pointer items-center gap-1 font-medium text-accent hover:underline",
        className,
      )}
    >
      {symbol}
      <ChevronDown
        className={cn("h-3.5 w-3.5 shrink-0 text-muted transition-transform", open && "rotate-180")}
        aria-hidden
      />
    </button>
  );
}

export function SetupCardPanel({
  id,
  model,
  headline,
  stage,
  onStageChange,
  extra,
  actions,
  className,
}: {
  /** Matches the `controls` the name button points at. */
  id: string;
  model: SetupCardModel;
  /** The surface's own score display — a `ScoreBadge`, or the intraday confidence. */
  headline: ReactNode;
  stage: Exclude<CardStage, "closed">;
  onStageChange: (stage: "half" | "full") => void;
  /** Extra sections shown only in the full card (the intraday plans, for one). */
  extra?: ReactNode;
  /** Extra links beside "Open the full scan for …" (the intraday "Trade this"). */
  actions?: ReactNode;
  className?: string;
}) {
  const full = stage === "full";
  const { levels } = model;

  return (
    <div
      id={id}
      className={cn("flex flex-col gap-3 rounded-lg border border-border bg-background p-3 sm:p-4", className)}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {headline}
        {model.alignmentScore != null && (
          <span
            className="text-xs text-muted"
            title="How closely this setup matches the platform's rules, 0 to 100"
          >
            Rules alignment {Math.round(model.alignmentScore)}/100
            {model.signal ? ` (${model.signal.tierLabel})` : ""}
          </span>
        )}
        {model.continuation && (
          <span className="text-xs text-muted">Momentum continuation — trades with the trend</span>
        )}
      </div>

      <p className="text-sm leading-relaxed">{model.synopsis}</p>

      {full && (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Level label="Entry" value={levels.entry} tone="accent" hint="Where the setup turns on." />
            <Level
              label="Exit (S/L)"
              value={levels.stop}
              tone="bear"
              hint="The stop-loss: the price that says the setup failed."
            />
            <Level
              label="TP1"
              value={levels.tp1}
              tone="bull"
              hint="First take-profit."
              multiple={rewardToRisk(levels, levels.tp1)}
            />
            <Level
              label="MTP"
              value={levels.mtp}
              tone="bull"
              hint="Master take profit: the further target the runner works toward."
              multiple={rewardToRisk(levels, levels.mtp)}
            />
          </dl>

          {model.checks.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">What lined up</p>
              <ul className="flex flex-col gap-1">
                {model.checks.map((c) => (
                  <CheckLine key={c.label} check={c} />
                ))}
              </ul>
              {model.stateNote && <p className="text-xs text-muted">{model.stateNote}</p>}
            </div>
          )}

          {model.signal && (
            <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
              Signal Engine read:
              <Badge variant={model.signal.tradeable ? "bull" : "muted"}>{model.signal.tierLabel}</Badge>
              <span>{model.signal.stateLabel}</span>
            </p>
          )}

          {(model.higherTimeframes || model.patternLabel) && (
            <div className="flex flex-col gap-1 text-xs text-muted">
              {model.higherTimeframes && <p>Higher timeframes: {model.higherTimeframes}.</p>}
              {model.patternLabel && (
                <p>Reversal pattern (reference only, not this trade&apos;s entry rule): {model.patternLabel}.</p>
              )}
            </div>
          )}

          {extra}
        </>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          onClick={() => onStageChange(full ? "half" : "full")}
          aria-expanded={full}
          className="inline-flex min-h-8 cursor-pointer items-center gap-1 text-sm font-medium text-accent hover:underline"
        >
          {full ? "Collapse" : "Show the full card"}
          {full ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
        </button>
        <Link href={model.tickerHref} className="text-sm font-medium text-accent hover:underline">
          Open the full scan for {model.symbol}
        </Link>
        {actions}
      </div>
    </div>
  );
}

function Level({
  label,
  value,
  tone,
  hint,
  multiple,
}: {
  label: string;
  value: number | null;
  tone: "accent" | "bull" | "bear";
  hint: string;
  multiple?: number | null;
}) {
  return (
    <div title={hint}>
      <dt className="text-[11px] uppercase tracking-wide text-muted">{label}</dt>
      <dd
        className={cn(
          "font-mono text-sm",
          tone === "bull" && "text-bull",
          tone === "bear" && "text-bear",
          tone === "accent" && "text-accent",
        )}
      >
        {value != null ? formatUsd(value) : "—"}
        {multiple != null && <span className="ml-1.5 text-[11px] text-muted">{multiple.toFixed(1)}× risk</span>}
      </dd>
    </div>
  );
}

function CheckLine({ check }: { check: SetupCheck }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      {check.state === "met" ? (
        <Check className="mt-0.5 size-4 shrink-0 text-bull" aria-label="Lined up" />
      ) : check.state === "partial" ? (
        <Minus className="mt-0.5 size-4 shrink-0 text-warn" aria-label="Partly lined up" />
      ) : (
        <X className="mt-0.5 size-4 shrink-0 text-bear" aria-label="Did not line up" />
      )}
      <span className={cn(check.state === "missed" && "text-muted")}>
        {check.label}
        {check.detail && <span className="ml-1.5 text-xs text-muted">{check.detail}</span>}
      </span>
    </li>
  );
}

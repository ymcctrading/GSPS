"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Check, ChevronDown, ChevronUp, Minus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, formatUsd } from "@/lib/utils";
import { useTerms } from "@/components/vocabulary";
import { rewardToRisk, voiced, type SetupCardModel, type SetupCheck } from "@/lib/setups/card";
import type { BriefLevelRole, BriefVoice, SetupBrief } from "@/lib/setups/brief";
import { PlanReadingLine } from "@/components/strategies/plan-reading-line";
import { planFromLevels } from "@/lib/strategies/explain/params";

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
  briefVoice = "plain",
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
  /**
   * The brief's voice: plain for Novice and Pro, full for Expert and Wall
   * Street (`briefVoiceOf`). Defaults to plain, the voice any viewer may read.
   */
  briefVoice?: BriefVoice;
}) {
  const full = stage === "full";
  const brief = model.brief ?? null;
  const reasonOf = (role: BriefLevelRole) => {
    const level = brief?.plan.find((l) => l.role === role);
    return level ? voiced(level.reason, briefVoice) : null;
  };
  const tp2 = brief?.plan.find((l) => l.role === "tp2") ?? null;
  const { levels } = model;
  // Level names in the member's words (lib/school/terms.ts).
  const term = useTerms();
  // A target already behind price on a resting order counts only once the
  // entry fills (lib/setups/resting.ts), so it is not shown as reachable now.
  const behind = (t: "TP1" | "MTP") => model.resting?.targetsBehindPrice.includes(t) ?? false;

  return (
    <div
      id={id}
      className={cn("flex flex-col gap-3 rounded-lg border border-border bg-background p-3 sm:p-4", className)}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {headline}
        {model.resting && (
          <Badge variant="muted" title="The entry is further from today's price than a normal day's move: an order waiting at its level for price to come back, not a trade to take today.">
            Resting order
          </Badge>
        )}
        {model.continuation && (
          <span className="text-xs text-muted">With the trend: taken on the trend, however far it has run</span>
        )}
      </div>

      {brief ? (
        <>
          <p className="text-sm leading-relaxed">{voiced(brief.call, briefVoice)}</p>
          <p className="text-sm leading-relaxed">{voiced(brief.decidingLine, briefVoice)}</p>
        </>
      ) : (
        <p className="text-sm leading-relaxed">{model.synopsis}</p>
      )}
      {model.setAsideNote && <p className="text-xs text-muted">{model.setAsideNote}</p>}

      {full && (
        <>
          <dl className={cn("grid grid-cols-2 gap-3", tp2 ? "sm:grid-cols-5" : "sm:grid-cols-4")}>
            <Level label="Entry" value={levels.entry} tone="accent" hint="Where the setup turns on." reason={reasonOf("entry")} />
            <Level
              label={term("stopLoss")}
              value={levels.stop}
              tone="bear"
              hint="The stop-loss: the price that says the setup failed."
              reason={reasonOf("stop")}
            />
            <Level
              label={term("tp1")}
              value={levels.tp1}
              tone="bull"
              hint="First take-profit."
              multiple={rewardToRisk(levels, levels.tp1)}
              note={behind("TP1") ? "after the entry fills" : null}
              reason={reasonOf("tp1")}
            />
            {tp2 && (
              <Level
                label={term("tp2")}
                value={tp2.price}
                tone="bull"
                hint="Second take-profit: the strongest level between TP1 and the MTP."
                multiple={tp2.multiple}
                reason={voiced(tp2.reason, briefVoice)}
              />
            )}
            <Level
              label={term("mtp")}
              value={levels.mtp}
              tone="bull"
              hint="Master take profit: the further target the runner works toward."
              multiple={rewardToRisk(levels, levels.mtp)}
              note={behind("MTP") ? "after the entry fills" : null}
              reason={reasonOf("mtp")}
            />
          </dl>
          {brief && <BriefSections brief={brief} voice={briefVoice} />}
          <PlanReadingLine
            symbol={model.symbol}
            plan={planFromLevels(model.side, levels)}
          />

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
  note,
  reason,
}: {
  label: string;
  value: number | null;
  tone: "accent" | "bull" | "bear";
  hint: string;
  multiple?: number | null;
  /** A short qualifier under the value, such as a target that counts only once the entry fills. */
  note?: string | null;
  /** Why this level, from the setup brief. */
  reason?: string | null;
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
      {note && <dd className="text-[11px] text-muted">{note}</dd>}
      {reason && <dd className="text-[11px] leading-snug text-muted">{reason}</dd>}
    </div>
  );
}

/** The brief's middle: both sides, timing, what proves it wrong, what to watch. */
export function BriefSections({ brief, voice }: { brief: SetupBrief; voice: BriefVoice }) {
  const call = brief.side === "buy" ? "buy" : "sell";
  const other = brief.side === "buy" ? "sell" : "buy";
  // Plain voice keeps each side to its two strongest lines (spec, "Two voices").
  const cap = voice === "full" ? 4 : 2;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <BriefList title={`For the ${call}`} items={brief.forCall.slice(0, cap).map((t) => voiced(t, voice))} empty="Nothing beyond the plan itself." />
        <BriefList title={`For the ${other}`} items={brief.forOther.slice(0, cap).map((t) => voiced(t, voice))} empty="Nothing on the chart argues the other way yet." />
      </div>
      {brief.timing.length > 0 && <BriefList title="Timing" items={brief.timing.map((t) => voiced(t, voice))} />}
      <div className="flex flex-col gap-1 text-sm">
        <p>
          <span className="font-medium">Wrong if: </span>
          {voiced(brief.wrongIf, voice).replace(/^Wrong if /, "")}
        </p>
        <p>
          <span className="font-medium">Watch for: </span>
          {voiced(brief.watch, voice).replace(/^Watch for /, "")}
        </p>
      </div>
    </div>
  );
}

function BriefList({ title, items, empty }: { title: string; items: string[]; empty?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{title}</p>
      {items.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <ul className="flex list-disc flex-col gap-1 pl-4 text-sm">
          {items.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
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

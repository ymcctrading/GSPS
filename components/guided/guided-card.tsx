"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatUsd, cn } from "@/lib/utils";
import { GUIDED_DISCLOSURE } from "@/lib/guided/config";
import type { Recommendation } from "@/lib/guided/service";

/**
 * One recommendation, as a card rather than a row of numbers.
 *
 * The order of what is on it is the product: what to do, how much, what it
 * costs if it fails, and only then — behind a link, never removed — the score
 * breakdown and the levels for the user who wants to check the work. The
 * disclosure sits directly above the button that opens the confirmation, not in
 * a linked terms page, because the moment of the tap is the moment it is for.
 */
export function GuidedCard({
  rec,
  onConfirm,
  onDismiss,
  busy,
}: {
  rec: Recommendation;
  onConfirm: () => void;
  onDismiss: () => void;
  busy: boolean;
}) {
  const [showWhy, setShowWhy] = useState(false);
  // A short is a different trade, not a differently-coloured one: the verb on
  // the button, the badge and its colour all follow the side, so the card can
  // never read "Buy" for an order that would sell.
  const short = rec.action === "sell";
  const verb = short ? "Sell short" : "Buy";

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-semibold">{rec.symbol}</span>
            <span className="font-mono text-sm text-muted">{formatUsd(rec.currentPrice)}</span>
          </div>
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide",
              short ? "bg-bear/10 text-bear" : "bg-bull/10 text-bull",
            )}
          >
            {short ? "Sell short" : "Buy"}
          </span>
        </div>

        <p className="text-sm leading-relaxed">{rec.reason}</p>

        <div className="rounded-lg border border-border bg-background px-4 py-3">
          <p className="text-sm">
            <span className="text-muted">Recommended size:</span>{" "}
            <span className="font-medium">
              {rec.qty} share{rec.qty === 1 ? "" : "s"}
            </span>{" "}
            <span className="text-muted">({formatUsd(rec.notionalUsd, 0)})</span>
          </p>
          <p className="mt-1.5 text-sm leading-relaxed">{rec.riskRewardSentence}</p>
        </div>

        <button
          type="button"
          onClick={() => setShowWhy((v) => !v)}
          aria-expanded={showWhy}
          className="inline-flex w-fit items-center gap-1 text-sm font-medium text-accent hover:underline cursor-pointer"
        >
          Why this one?
          <ChevronDown className={cn("h-4 w-4 transition-transform", showWhy && "rotate-180")} />
        </button>

        {showWhy && <WhyPanel rec={rec} />}

        <p className="text-xs leading-relaxed text-muted">{GUIDED_DISCLOSURE}</p>

        <div className="flex flex-wrap gap-2">
          <Button onClick={onConfirm} disabled={busy} size="lg" className="flex-1 sm:flex-none">
            {verb} {rec.qty} {rec.symbol}
          </Button>
          <Button onClick={onDismiss} disabled={busy} variant="outline" size="lg">
            Skip
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** The work, shown rather than removed: the same score rollup and levels the ticker page uses. */
function WhyPanel({ rec }: { rec: Recommendation }) {
  const { why } = rec;
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-background px-4 py-3 text-sm">
      <p>
        <span className="text-muted">Score:</span>{" "}
        <span className="font-medium">
          {why.score.score} of {why.score.max}
        </span>{" "}
        <span className="text-muted">· {why.verdict}</span>
      </p>
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {why.score.pillars.map((p) => (
          <li key={p.pillar} className="flex justify-between gap-3 text-xs">
            <span className="text-muted capitalize">{p.pillar}</span>
            <span className="font-mono">
              {p.met}/{p.total}
            </span>
          </li>
        ))}
      </ul>
      {why.score.stateNote && <p className="text-xs text-muted">{why.score.stateNote}</p>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {/* Tone tracks meaning, not direction: a target is the good outcome and
            the stop the bad one on either side, even though a short's targets
            sit below its entry rather than above. */}
        <Level label="Entry" value={why.entry} tone="accent" />
        <Level label="Stop" value={why.stopLoss} tone="bear" />
        <Level label="Target 1" value={why.takeProfit1} tone="bull" />
        <Level label="Target 2" value={why.masterProfit} tone="bull" />
      </div>
      <p className="text-xs text-muted">{rec.exitSentence}</p>
      <p className="text-xs text-muted">Higher timeframes: {why.trend}.</p>
      <Link href={why.tickerHref} className="w-fit text-sm font-medium text-accent hover:underline">
        Open the full scan for {rec.symbol}
      </Link>
    </div>
  );
}

function Level({ label, value, tone }: { label: string; value: number; tone: "accent" | "bull" | "bear" }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted">{label}</p>
      <p
        className={cn(
          "font-mono text-sm",
          tone === "bull" && "text-bull",
          tone === "bear" && "text-bear",
          tone === "accent" && "text-accent",
        )}
      >
        {formatUsd(value)}
      </p>
    </div>
  );
}

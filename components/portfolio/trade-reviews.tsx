"use client";

/**
 * Trade Reviews — a personal, single-trade mirror of GSPS's own Rules
 * Alignment evidence against how each of a user's own closed/expired/
 * invalidated trade plans actually resolved.
 *
 * This is this platform's Polarity counterpart, available at every tier, to
 * Wall-Street-only backtest attribution (lib/backtest/attribution.ts) — see
 * AGENTS.md's Polarity-audit section. It deliberately reports no expectancy,
 * win rate, or profit factor across trades (those remain backtesting's own,
 * gated claims); it only pairs one plan's criteria (cause) with its own
 * outcome (effect) for the trade that produced it, per
 * lib/lifecycle/review.ts's own doc comment.
 */

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Check, X, MinusCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface AlignmentBreakdownItem {
  key: string;
  label: string;
  points: number;
  maxPoints: number;
  applicable: boolean;
  passed: boolean;
  note: string;
}

interface ReviewEntry {
  instrument: string;
  direction: "bullish" | "bearish";
  generatedAt: string;
  closedAt: string | null;
  review: {
    planAdherence: "followed" | "deviated" | "not_entered";
    ruleState: string;
    lessonTags: string[];
    summary: string;
    alignment: { score: number; tier: string; breakdown: AlignmentBreakdownItem[] };
  };
}

export function TradeReviews() {
  const [reviews, setReviews] = useState<ReviewEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/trade-plans/reviews")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        setReviews(data.reviews ?? []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  const [expanded, setExpanded] = useState(false);
  const count = reviews?.length ?? 0;
  const togglable = count > 0;

  return (
    <Card>
      <CardHeader>
        {togglable ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="flex w-full cursor-pointer flex-col gap-1 text-left"
          >
            <div className="flex items-center gap-1.5">
              {expanded ? (
                <ChevronDown className="size-4 shrink-0 text-muted" aria-hidden />
              ) : (
                <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
              )}
              <CardTitle>Trade Reviews ({count})</CardTitle>
            </div>
            <CardDescription>
              For each closed trade plan: which of GSPS&apos;s criteria were present when the plan was
              generated, and how the trade actually resolved. Not a backtest — no win rate or
              expectancy across trades, just your own trade&apos;s cause and effect.
            </CardDescription>
          </button>
        ) : (
          <>
            <CardTitle>Trade Reviews (0)</CardTitle>
            <CardDescription>
              For each closed trade plan: which of GSPS&apos;s criteria were present when the plan was
              generated, and how the trade actually resolved.
            </CardDescription>
          </>
        )}
      </CardHeader>
      {(!togglable || expanded) && (
        <CardContent>
          {error && <p className="text-sm text-bear">{error}</p>}
          {!error && reviews === null && <p className="py-6 text-center text-sm text-muted">Loading…</p>}
          {!error && reviews !== null && reviews.length === 0 && (
            <p className="py-6 text-center text-sm text-muted">
              No closed trade plans yet — a review appears here once one closes, expires, or is
              invalidated.
            </p>
          )}
          {!error && reviews !== null && reviews.length > 0 && (
            <div className="flex flex-col gap-3">
              {reviews.map((r, idx) => (
                <ReviewRow
                  key={`${r.instrument}-${r.generatedAt}`}
                  entry={r}
                  open={expandedIdx === idx}
                  onToggle={() => setExpandedIdx((prev) => (prev === idx ? null : idx))}
                />
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function ReviewRow({ entry, open, onToggle }: { entry: ReviewEntry; open: boolean; onToggle: () => void }) {
  const { review } = entry;
  return (
    <div className="rounded-md border border-border">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center justify-between gap-3 p-3 text-left"
      >
        <div className="flex items-center gap-2">
          {open ? (
            <ChevronDown className="size-4 shrink-0 text-muted" aria-hidden />
          ) : (
            <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
          )}
          <span className="font-medium">{entry.instrument}</span>
          <Badge variant="muted">{entry.direction}</Badge>
          <Badge variant={review.planAdherence === "followed" ? "default" : "muted"}>
            {review.planAdherence.replace("_", " ")}
          </Badge>
        </div>
        <span className="text-xs text-muted">
          Rules Alignment {review.alignment.score}/100 ({review.alignment.tier})
        </span>
      </button>
      {open && (
        <div className="flex flex-col gap-3 border-t border-border p-3">
          <p className="text-sm text-muted">{review.summary}</p>
          <div className="flex flex-col gap-1.5">
            {review.alignment.breakdown.map((item) => (
              <div key={item.key} className="flex items-start gap-2 text-sm">
                {!item.applicable ? (
                  <MinusCircle className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                ) : item.passed ? (
                  <Check className="mt-0.5 size-4 shrink-0 text-bull" aria-hidden />
                ) : (
                  <X className="mt-0.5 size-4 shrink-0 text-bear" aria-hidden />
                )}
                <div className="flex flex-col">
                  <span className={cn(!item.applicable && "text-muted")}>{item.label}</span>
                  {item.note && <span className="text-xs text-muted">{item.note}</span>}
                </div>
              </div>
            ))}
            {review.alignment.breakdown.length === 0 && (
              <p className="text-xs text-muted">No per-criterion evidence recorded for this plan.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

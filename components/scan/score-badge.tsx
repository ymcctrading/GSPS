import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatScore } from "@/lib/scoring/display";

/**
 * `exactScoreDisplayEnabled` is required, not defaulted, so every caller has
 * to say which tier it's rendering for rather than silently leaking the
 * exact figure to a Novice/Pro viewer — see `lib/scoring/display.ts`.
 */
export function ScoreBadge({
  score,
  state,
  exactScoreDisplayEnabled,
  compact = false,
}: {
  score: number;
  state: string;
  exactScoreDisplayEnabled: boolean;
  /** The score alone, the tier in its colour and title: a list's score column. */
  compact?: boolean;
}) {
  const variant = state === "Execute" ? "bull" : state === "Watch" ? "warn" : state === "Resting" ? "default" : "muted";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        title={compact ? state : undefined}
        className={cn(
          "inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold",
          state === "Execute" && "bg-bull text-white",
          state === "Watch" && "bg-warn text-white",
          state === "Resting" && "bg-accent text-white",
          state === "Reject" && "bg-background text-muted border border-border",
        )}
      >
        {formatScore(score, exactScoreDisplayEnabled)}
      </span>
      {!compact && <Badge variant={variant}>{state}</Badge>}
    </span>
  );
}

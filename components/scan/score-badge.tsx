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
}: {
  score: number;
  state: string;
  exactScoreDisplayEnabled: boolean;
}) {
  const variant = state === "Execute" ? "bull" : state === "Watch" ? "warn" : "muted";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={cn(
          "inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold",
          state === "Execute" && "bg-bull text-white",
          state === "Watch" && "bg-warn text-white",
          state === "Reject" && "bg-background text-muted border border-border",
        )}
      >
        {formatScore(score, exactScoreDisplayEnabled)}
      </span>
      <Badge variant={variant}>{state}</Badge>
    </span>
  );
}

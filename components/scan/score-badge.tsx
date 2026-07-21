import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function ScoreBadge({ score, state }: { score: number; state: string }) {
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
        {score}
      </span>
      <Badge variant={variant}>{state}</Badge>
    </span>
  );
}

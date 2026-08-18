import { ChevronDown } from "lucide-react";
import { patternEducation } from "@/lib/education/patterns";
import type { StratPattern } from "@/lib/types";

/**
 * Collapsible plain-language explainer for an armed pattern — what the shape
 * means, why it matters for entries/exits, and roughly how much confidence to
 * put in it. Closed by default so it doesn't compete with the trade plan
 * above it; a reader who already knows the pattern never has to see it.
 */
export function PatternEducation({ name }: { name: StratPattern["name"] }) {
  const edu = patternEducation(name);

  return (
    <details className="group rounded-lg border border-border bg-background">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-medium">
        <span>What does {edu.headline} mean?</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-180" />
      </summary>
      <dl className="flex flex-col gap-3 border-t border-border px-3 py-3 text-sm">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted">What it means</dt>
          <dd className="mt-0.5 text-foreground">{edu.whatItMeans}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
            Why it matters for entries &amp; exits
          </dt>
          <dd className="mt-0.5 text-foreground">{edu.whyItMatters}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted">How confident to be</dt>
          <dd className="mt-0.5 text-foreground">{edu.confidence}</dd>
        </div>
      </dl>
    </details>
  );
}

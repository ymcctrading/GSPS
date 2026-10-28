import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ContextRead, PublicScanResult } from "@/lib/types";

const ALIGNMENT_LABEL: Record<ContextRead["alignment"], string> = {
  aligned: "Agrees",
  conflict: "Disagrees",
  neutral: "Neutral",
  notImplemented: "Not available",
};

const ALIGNMENT_BADGE_VARIANT: Record<ContextRead["alignment"], "muted" | "bull" | "bear"> = {
  aligned: "bull",
  conflict: "bear",
  neutral: "muted",
  notImplemented: "muted",
};

/**
 * The ticker page's "Context" card (owner, 2026-10-28: the confluence card
 * becomes a short plain-English list for every tier). The sentences are
 * written on the server (`lib/signals/contextLines.ts`), so the response
 * carries plain words and no reading's own name (AGENTS.md "Confidential
 * sources"); this card only lays them out.
 *
 * Informational only: it never changes `decision`, a tradeable verdict or
 * account eligibility.
 */
export function ConfluenceCard({ result }: { result: PublicScanResult }) {
  const context = result.signals?.context;
  if (!context || (!context.levels && !context.barPattern)) return null;
  const lines = context.levels?.lines ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Context</CardTitle>
        <CardDescription>
          What else the chart shows around this setup, in plain words. None of it changes the
          setup, the score or the plan.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {context.levels && <ReadRow title="Price levels and timing" alignment={context.levels.alignment} note={context.levels.note} />}
        {context.barPattern && <ReadRow title="Bar pattern" alignment={context.barPattern.alignment} note={context.barPattern.note} />}
        {lines.length > 0 && (
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm">
            {lines.map((l) => (
              <li key={l.text}>
                {l.text}
                {l.note && <span className="text-xs text-muted"> {l.note}</span>}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ReadRow({ title, alignment, note }: { title: string; alignment: ContextRead["alignment"]; note: string | null }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">{title}</p>
        <Badge variant={ALIGNMENT_BADGE_VARIANT[alignment]}>{ALIGNMENT_LABEL[alignment]}</Badge>
      </div>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
    </div>
  );
}

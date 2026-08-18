import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ScoreBadge } from "@/components/scan/score-badge";
import { Badge } from "@/components/ui/badge";
import { GlossaryTerm } from "@/components/glossary-term";
import { PatternEducation } from "@/components/scan/pattern-education";
import { SCORE_PILLAR_DESCRIPTIONS, SCORE_PILLAR_LABELS } from "@/lib/scoring/public-summary";
import { tradeSideLabel } from "@/lib/scoring/direction-copy";
import { PATTERN_GLOSSARY_TERM } from "@/lib/education/patterns";
import { formatUsd, cn } from "@/lib/utils";
import type { PublicScoreSummary, ScanResult } from "@/lib/types";

export function SignalCard({ result }: { result: ScanResult }) {
  const { decision, levels, levelsError, pattern, dataLag } = result;
  const armed = result.armedPatterns ?? (pattern ? [pattern] : []);
  const others = armed.filter((p) => p !== pattern);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Protocol signal</CardTitle>
          <ScoreBadge score={decision.score} state={decision.outputState} />
        </div>
        {pattern ? (
          <CardDescription>
            <GlossaryTerm term={PATTERN_GLOSSARY_TERM[pattern.name]} label={pattern.name} />{" "}
            <span className={pattern.direction === "bullish" ? "text-bull" : "text-bear"}>
              {tradeSideLabel(pattern.direction)}
            </span>{" "}
            — {pattern.description}
          </CardDescription>
        ) : (
          <CardDescription>No reversal pattern is currently armed on the execution timeframe.</CardDescription>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {pattern && <PatternEducation name={pattern.name} />}
        {others.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-muted">Also armed:</span>
            {others.map((p, i) => (
              <Badge key={`${p.name}-${p.direction}-${i}`} variant="muted">
                {p.name}{" "}
                <span className={p.direction === "bullish" ? "text-bull" : "text-bear"}>
                  {tradeSideLabel(p.direction)}
                </span>
              </Badge>
            ))}
          </div>
        )}
        {levels && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <LevelStat label="Entry" glossaryTerm="Entry (blue line)" value={formatUsd(levels.entry)} tone="accent" />
            <LevelStat
              label="Stop loss"
              glossaryTerm="Stop loss (red line)"
              value={formatUsd(levels.stopLoss)}
              tone="bear"
            />
            <LevelStat
              label={`TP1 (${levels.rewardToRiskTp1.toFixed(1)}R)`}
              glossaryTerm="TP1 - Take Profit 1 (green line)"
              value={formatUsd(levels.takeProfit1)}
              tone="bull"
            />
            <LevelStat
              label={`Master (${levels.rewardToRiskMaster.toFixed(1)}R)`}
              glossaryTerm="Master profit (green line)"
              value={formatUsd(levels.masterProfit)}
              tone="bull"
            />
          </div>
        )}

        {levels?.stopBandWarning && <Badge variant="warn">{levels.stopBandWarning}</Badge>}

        {/*
          The lag the verdict was decided under, stated on the card rather than
          left in the chart legend. When it runs a full bar or more the state is
          held at Watch, so the sentence explaining it has to be next to the
          state it explains.
        */}
        {dataLag && dataLag.delayMs > 0 && (
          <p className={cn("text-xs", dataLag.holdsExecute ? "text-warn" : "text-muted")}>
            {dataLag.note}
          </p>
        )}

        {!levels && levelsError && (
          <p className="text-sm text-bear">
            No trade plan for this setup — {levelsError} The rest of the scan below is unaffected.
          </p>
        )}

        {decision.summary && <ScoreBreakdown summary={decision.summary} />}
      </CardContent>
    </Card>
  );
}

/**
 * Where the score came from, at the only resolution that is ours to publish.
 *
 * Each pillar shows points earned out of points available, so a reader can see
 * that a setup is carried by structure and empty on timing. The conditions
 * inside a pillar — what each one tests, and where its threshold sits — are the
 * scoring model, and they never reach the browser: `/api/scan` strips them (see
 * lib/scoring/public-summary.ts), so there is nothing here to read back out of
 * a network response either.
 */
function ScoreBreakdown({ summary }: { summary: PublicScoreSummary }) {
  if (summary.pillars.length === 0) return null;

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h4 className="text-sm font-medium">Score breakdown</h4>
        <span className="font-mono text-xs text-muted tabular-nums">
          {summary.score}/{summary.max} points
        </span>
      </div>

      <ul className="flex flex-col gap-2">
        {summary.pillars.map((p) => (
          <li key={p.pillar} className="grid grid-cols-[7.5rem_auto_1fr] items-center gap-x-3 gap-y-0.5 sm:grid-cols-[9rem_auto_1fr]">
            <span className="text-sm font-medium">{SCORE_PILLAR_LABELS[p.pillar]}</span>

            {/* The meter is decoration; the count beside it carries the value. */}
            <span className="flex items-center gap-1" aria-hidden>
              {Array.from({ length: p.total }, (_, i) => (
                <span
                  key={i}
                  className={cn(
                    "h-1.5 w-5 rounded-full",
                    i < p.met ? "bg-accent" : "bg-border",
                  )}
                />
              ))}
            </span>

            <span className="font-mono text-xs text-muted tabular-nums">
              {p.met}/{p.total}
            </span>

            <span className="col-span-3 text-xs text-muted">
              {SCORE_PILLAR_DESCRIPTIONS[p.pillar]}
            </span>
          </li>
        ))}
      </ul>

      {summary.stateNote && <p className="mt-3 text-xs text-warn">{summary.stateNote}</p>}

      <p className="mt-3 text-xs text-muted">
        Grouped by category. The conditions each category tests are part of the GSPS scoring
        model and are not published.
      </p>
    </div>
  );
}

function LevelStat({
  label,
  glossaryTerm,
  value,
  tone,
}: {
  label: string;
  glossaryTerm: string;
  value: string;
  tone: "accent" | "bull" | "bear";
}) {
  const color = tone === "accent" ? "text-accent" : tone === "bull" ? "text-bull" : "text-bear";
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <p className="text-xs text-muted">
        <GlossaryTerm term={glossaryTerm} label={label} />
      </p>
      <p className={`mt-0.5 font-mono text-sm font-semibold ${color}`}>{value}</p>
    </div>
  );
}

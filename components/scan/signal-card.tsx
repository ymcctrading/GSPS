import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ScoreBadge } from "@/components/scan/score-badge";
import { Badge } from "@/components/ui/badge";
import { GlossaryTerm } from "@/components/glossary-term";
import { PatternEducation } from "@/components/scan/pattern-education";
import { SaveSetupButton } from "@/components/scan/save-setup-button";
import { SCORE_PILLAR_DESCRIPTIONS, SCORE_PILLAR_LABELS } from "@/lib/scoring/public-summary";
import { tradeSideLabel } from "@/lib/scoring/direction-copy";
import { PATTERN_GLOSSARY_TERM } from "@/lib/education/patterns";
import { formatUsd, cn } from "@/lib/utils";
import type { AssetClass, PublicScoreSummary, ScanResult } from "@/lib/types";

/**
 * The Protocol signal's own rationale, in the structural-trigger's own terms —
 * not the STRAT bar-sequence pattern's. Since 2026-09-17 (see AGENTS.md,
 * "Entry pricing moved off STRAT onto Gann's own rule") the trade plan is
 * armed and priced by crossing the prior completed swing's top/bottom plus a
 * "lost motion" overshoot allowance (`lib/gann/entryTrigger.ts`), not by a
 * bar-sequence pattern's penny-above-the-high trigger. This headline used to
 * render `pattern.description`, which is the bar-sequence pattern's own
 * language and can name a different bar — even a different direction — than
 * the one that actually armed and priced this trade plan. `result.direction`
 * is the direction the trade plan itself was computed against
 * (`lib/scanTicker.ts`'s `scoreDirection`), so that is what this card's
 * headline describes. Kept free of internal-methodology vocabulary per
 * `scripts/check-banned-terms.mjs` — see `docs/GSPS_BRAND_GUIDE.md`.
 */
function structuralTriggerHeadline(direction: "bullish" | "bearish"): string {
  return direction === "bullish"
    ? "Crossing the prior confirmed swing high, past the key level's lost-motion allowance."
    : "Breaking the prior confirmed swing low, past the key level's lost-motion allowance.";
}

/**
 * ScanResult -> the shape SaveSetupButton already knows how to save. Before
 * this, the button only existed inside ResultsTable (Dashboard preview,
 * Scanner Universe results) -- a symbol looked up directly by search, or a
 * ticker page opened from a link elsewhere, had no save affordance at all.
 */
function toSavedSetupRow(result: ScanResult) {
  return {
    symbol: result.symbol,
    score: result.decision.score,
    outputState: result.decision.outputState,
    direction: result.direction,
    entry: result.levels?.entry ?? null,
    stopLoss: result.levels?.stopLoss ?? null,
    takeProfit1: result.levels?.takeProfit1 ?? null,
    masterProfit: result.levels?.masterProfit ?? null,
    patternName: result.pattern?.name ?? null,
    setupKind: result.setupKind,
  };
}

/**
 * TP1/master labels: an R-multiple for every asset class except `us_equity`,
 * which prices targets as a percentage of purchase price and has no
 * risk-relative ratio to name — see lib/strat/levels.ts's own comment for
 * why. `rewardToRiskTp1`/`rewardToRiskMaster` are still computed for
 * equities (stop and target are independently derived, so a ratio always
 * falls out of the two prices), but showing it as "R" would claim a designed
 * multiple that was never priced, the exact copy-drift class
 * lib/trade/protocol-rules.ts already exists to prevent.
 */
function targetLabel(
  base: string,
  entry: number,
  targetPrice: number,
  rMultiple: number,
  assetClass: AssetClass,
): string {
  if (assetClass === "us_equity") {
    const pct = (Math.abs(targetPrice - entry) / entry) * 100;
    return `${base} (${pct.toFixed(1)}%)`;
  }
  return `${base} (${rMultiple.toFixed(1)}R)`;
}

export function SignalCard({ result }: { result: ScanResult }) {
  const { decision, levels, levelsError, pattern, dataLag, assetClass } = result;
  const armed = result.armedPatterns ?? (pattern ? [pattern] : []);
  const others = armed.filter((p) => p !== pattern);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Protocol signal</CardTitle>
          <div className="flex items-center gap-1.5">
            <ScoreBadge score={decision.score} state={decision.outputState} />
            <SaveSetupButton row={toSavedSetupRow(result)} />
          </div>
        </div>
        {result.direction !== "none" ? (
          <CardDescription>
            <span className={result.direction === "bullish" ? "text-bull" : "text-bear"}>
              {tradeSideLabel(result.direction)}
            </span>{" "}
            — {structuralTriggerHeadline(result.direction)}
          </CardDescription>
        ) : (
          <CardDescription>No structural entry trigger is currently armed on the execution timeframe.</CardDescription>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {pattern && (
          <div className="rounded-md border border-border bg-background p-3">
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <p className="text-xs font-medium text-muted">
                Reversal pattern <span className="font-normal">— reference only, not this trade&apos;s entry rule</span>
              </p>
              <Badge variant="muted">
                <GlossaryTerm term={PATTERN_GLOSSARY_TERM[pattern.name]} label={PATTERN_GLOSSARY_TERM[pattern.name]} />{" "}
                <span className={pattern.direction === "bullish" ? "text-bull" : "text-bear"}>
                  {tradeSideLabel(pattern.direction)}
                </span>
              </Badge>
            </div>
            <p className="mt-1.5 text-xs text-muted">
              {pattern.direction !== result.direction && result.direction !== "none"
                ? `This bar-sequence read is ${pattern.direction}, the opposite side from the structural trigger above — they're independent methods and are expected to disagree sometimes. `
                : ""}
              {pattern.description}
            </p>
            <div className="mt-2">
              <PatternEducation name={pattern.name} />
            </div>
            {others.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-muted">Also armed:</span>
                {others.map((p, i) => (
                  <Badge key={`${p.name}-${p.direction}-${i}`} variant="muted">
                    {PATTERN_GLOSSARY_TERM[p.name]}{" "}
                    <span className={p.direction === "bullish" ? "text-bull" : "text-bear"}>
                      {tradeSideLabel(p.direction)}
                    </span>
                  </Badge>
                ))}
              </div>
            )}
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
              label={targetLabel("TP1", levels.entry, levels.takeProfit1, levels.rewardToRiskTp1, assetClass)}
              glossaryTerm="TP1 - Take Profit 1 (green line)"
              value={formatUsd(levels.takeProfit1)}
              tone="bull"
            />
            <LevelStat
              label={targetLabel(
                "Master",
                levels.entry,
                levels.masterProfit,
                levels.rewardToRiskMaster,
                assetClass,
              )}
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

        {levels?.pivotPlan && (
          <div className="rounded-md border border-border bg-background p-3">
            <p className="text-xs font-medium text-muted">Pivot plan</p>
            <dl className="mt-1 flex flex-col gap-1 text-sm">
              <PivotPlanLine label="Confirmation" value={levels.pivotPlan.confirmation} />
              <PivotPlanLine
                label="Invalidation"
                value={levels.pivotPlan.invalidation != null ? formatUsd(levels.pivotPlan.invalidation) : "Not defined"}
              />
              <PivotPlanLine
                label="First target"
                value={levels.pivotPlan.firstTarget != null ? formatUsd(levels.pivotPlan.firstTarget) : "Not defined"}
              />
              <PivotPlanLine label="Cancel if" value={levels.pivotPlan.cancelIf} />
            </dl>
          </div>
        )}

        {decision.summary && <ScoreBreakdown summary={decision.summary} />}
      </CardContent>
    </Card>
  );
}

function PivotPlanLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
      <dt className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted sm:w-24">{label}</dt>
      <dd>{value}</dd>
    </div>
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

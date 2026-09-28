import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PATTERN_GLOSSARY_TERM } from "@/lib/education/patterns";
import type { ConfluenceAlignment } from "@/lib/signals/confluence/types";
import type { ScanResult } from "@/lib/types";

const ALIGNMENT_LABEL: Record<ConfluenceAlignment, string> = {
  aligned: "Aligned",
  conflict: "Conflict",
  neutral: "Neutral",
  notImplemented: "Not available",
};

const ALIGNMENT_BADGE_VARIANT: Record<ConfluenceAlignment, "muted" | "bull" | "bear"> = {
  aligned: "bull",
  conflict: "bear",
  neutral: "muted",
  notImplemented: "muted",
};

/**
 * Gann Confluence Layer / Sara Confluence Layer — additive confluence reads
 * from the addendum's cross-market integration (2026-08-28).
 * Renders the three-way framework identity (Gann North Star, Sara
 * confluence/strategy module, GSPS core governance) the addendum's
 * acceptance criteria require, and nothing that would let a reader
 * reconstruct which internal threshold decided an alignment — same
 * redaction rule as `SignalRegimeCard`.
 *
 * Neither module ever overrides GSPS core: this card is informational only
 * and never changes `decision`, `signals.*` tradeable verdicts, or account
 * eligibility.
 */
export function ConfluenceCard({ result }: { result: ScanResult }) {
  const { signals } = result;
  if (!signals) return null;

  const { gannConfluence, saraConfluence } = signals;
  if (!gannConfluence && !saraConfluence) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cross-Market Confluence</CardTitle>
        <CardDescription>
          The structural coordinate module is GSPS&apos;s North Star numerical/coordinate context;
          the price-action confirmation module is a cross-market, multi-timeframe confirmation
          layer. Both are confluence factors on the GSPS Core signal above — alignment can improve
          rank, and material conflict can downgrade a setup, but neither alone produces or blocks a
          trade.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {gannConfluence && <GannRow result={gannConfluence} />}
        {saraConfluence && <SaraRow result={saraConfluence} />}
      </CardContent>
    </Card>
  );
}

function GannRow({ result }: { result: NonNullable<ScanResult["signals"]>["gannConfluence"] }) {
  if (!result) return null;
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Structural Coordinate Confluence</p>
          <p className="text-xs text-muted">
            Coordinate context and target refinement — not a sole signal.
          </p>
        </div>
        <Badge variant={ALIGNMENT_BADGE_VARIANT[result.alignment]}>
          {ALIGNMENT_LABEL[result.alignment]}
        </Badge>
      </div>
      {result.marketAdapterStatus === "unsupported" ? (
        <p className="mt-2 text-xs text-muted">{result.note}</p>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
          {result.nearestSquareOf9 && (
            <div className="rounded-md border border-border bg-surface p-2">
              <p className="text-muted">Nearest key price level</p>
              <p className="font-mono font-semibold">{result.nearestSquareOf9.price.toFixed(2)}</p>
            </div>
          )}
          {result.nearestFanLine && (
            <div className="rounded-md border border-border bg-surface p-2">
              <p className="text-muted">Nearest fan line</p>
              <p className="font-mono font-semibold">{result.nearestFanLine.angle}</p>
              {result.nearestFanLine.timeProjectionDate && (
                <p className="text-[10px] text-muted">Time target: {result.nearestFanLine.timeProjectionDate}</p>
              )}
            </div>
          )}
          <div className="rounded-md border border-border bg-surface p-2">
            <p className="text-muted">Time cycle</p>
            <p className="font-mono font-semibold">{result.timeCycleActive ? "Active" : "None"}</p>
          </div>
          {result.nearestMasterTwelve && (
            <div className="rounded-md border border-border bg-surface p-2">
              <p className="text-muted">Nearest Master Twelve level</p>
              <p className="font-mono font-semibold">{result.nearestMasterTwelve.price.toFixed(2)}</p>
            </div>
          )}
          <div className="rounded-md border border-border bg-surface p-2">
            <p className="text-muted">Square of 52 window</p>
            <p className="font-mono font-semibold">{result.squareOf52.active ? "Active" : "None"}</p>
          </div>
          <div className="rounded-md border border-border bg-surface p-2">
            <p className="text-muted">36-angle month-count</p>
            <p className="font-mono font-semibold">{result.angleMonthCounts.active ? "Active" : "None"}</p>
          </div>
          <div className="rounded-md border border-border bg-surface p-2">
            <p className="text-muted">Spectral cycle (hypothesis)</p>
            <p className="font-mono font-semibold">
              {result.spectralCycle.active ? `~${result.spectralCycle.dominantPeriodBars} bars` : "None"}
            </p>
          </div>
          {result.campaignLeg.legNumber != null && (
            <div className="rounded-md border border-border bg-surface p-2">
              <p className="text-muted">Campaign leg</p>
              <p className="font-mono font-semibold">
                {result.campaignLeg.legNumber} ({result.campaignLeg.confidence})
              </p>
            </div>
          )}
          {result.boilingPoint.length > 0 && (
            <div className="rounded-md border border-border bg-surface p-2">
              <p className="text-muted">Blow-off duration</p>
              <p className="font-mono font-semibold">
                {result.boilingPoint[0].weeksSinceClimax}wk ({result.boilingPoint[0].phase})
              </p>
            </div>
          )}
          <DisclosedRuleTiles rules={result.disclosedRules} />
        </div>
      )}
    </div>
  );
}

const COUNTER_MOVE_LABEL = {
  normal: "normal (2-3 weeks)",
  extended: "longer than usual",
  secondMonth: "into a 2nd month",
  thirdMonth: "3rd month: trend change",
} as const;

/**
 * Stage A context (`lib/gann/disclosedRules.ts`). Optional-chained because
 * scan results cached before these fields existed don't carry them.
 */
function DisclosedRuleTiles({
  rules,
}: {
  rules: NonNullable<NonNullable<ScanResult["signals"]>["gannConfluence"]>["disclosedRules"] | undefined;
}) {
  if (!rules) return null;
  const tiles: { label: string; value: string }[] = [];
  if (rules.counterMove?.inCounterMove && rules.counterMove.phase) {
    tiles.push({
      label: "Counter-move length",
      value: `${rules.counterMove.days}d (${COUNTER_MOVE_LABEL[rules.counterMove.phase]})`,
    });
  }
  const pct = rules.pricePercentages;
  if (pct?.nearestAbove || pct?.nearestBelow) {
    tiles.push({
      label: "Percent-of-price levels",
      value: `${pct.nearestBelow ? pct.nearestBelow.price.toFixed(2) : "—"} / ${pct.nearestAbove ? pct.nearestAbove.price.toFixed(2) : "—"}`,
    });
  }
  const tests = [rules.levelTests.support, rules.levelTests.resistance].filter((t) => t && t.tests >= 2);
  if (tests.length > 0) {
    tiles.push({
      label: "Level tests",
      value: tests.map((t) => `${t!.level.toFixed(2)} ×${t!.tests}`).join(", "),
    });
  }
  if (rules.yearFraction) {
    tiles.push({ label: "Time from pivot", value: `${rules.yearFraction.fraction} (${rules.yearFraction.daysSincePivot}d)` });
  } else if (rules.dayCountBands.length > 0) {
    const d = rules.dayCountBands[0];
    tiles.push({ label: "Time from pivot", value: `${d.daysSincePivot}d (${d.band[0]}-${d.band[1]} band)` });
  }
  if (rules.barMidpoint) {
    tiles.push({ label: "Closes above bar midpoint", value: `${rules.barMidpoint.upOfLast5} of last 5` });
  }
  const rot = rules.ruleOfThree;
  const rotText = [
    rot.weekly?.bearishSignal ? "weekly 3 lower" : rot.weekly?.bullishSignal ? "weekly 2 higher" : null,
    rot.monthly?.bearishSignal ? "monthly 3 lower" : rot.monthly?.bullishSignal ? "monthly 2 higher" : null,
  ].filter(Boolean);
  if (rotText.length > 0) tiles.push({ label: "Rule of Three (W/M)", value: rotText.join(", ") });
  // Stage F1: extreme-price and timing rules (cached results may predate them).
  const rs = rules.extremes?.reverseSignal;
  if (rs?.signal) {
    tiles.push({ label: "Reversal day", value: `${rs.signal} (${rs.rule === "reverseDay" ? "reverse day" : `${rs.runDays}-day run broken`})` });
  }
  const gaps = rules.extremes?.gaps;
  const gapText = [
    gaps?.exhaustGap ? `exhaust gap at ${gaps.exhaustGap}` : null,
    gaps?.gapsInNewTerritory && gaps.gapsInNewTerritory.count >= 3 ? `${gaps.gapsInNewTerritory.count} ${gaps.gapsInNewTerritory.direction} gaps` : null,
    gaps?.filledGapReversal ? `filled gap: minor trend ${gaps.filledGapReversal}` : null,
  ].filter(Boolean);
  if (gapText.length > 0) tiles.push({ label: "Gaps", value: gapText.join(", ") });
  const timing = rules.timing;
  const timingText = [
    timing?.alternation?.mark ? `${timing.alternation.mark}-day turn count` : null,
    timing?.square144 && timing.square144.units.length >= 2 ? `12-multiple in ${timing.square144.units.join("+")}` : null,
  ].filter(Boolean);
  if (timingText.length > 0) tiles.push({ label: "Turn timing", value: timingText.join(", ") });
  if (rules.zone) {
    tiles.push({ label: "Zone of activity", value: `${rules.zone.zone > 0 ? "+" : ""}${rules.zone.zone}${rules.zone.firstSignOfEnd ? " (first sign of the end)" : ""}` });
  }
  if (timing?.projection) {
    tiles.push({ label: `Next swing ${timing.projection.kind}`, value: `~${timing.projection.medianDate} (±${Math.round(timing.projection.spreadDays / 2)}d)` });
  }
  return (
    <>
      {tiles.map((t) => (
        <div key={t.label} className="rounded-md border border-border bg-surface p-2">
          <p className="text-muted">{t.label}</p>
          <p className="font-mono font-semibold">{t.value}</p>
        </div>
      ))}
    </>
  );
}

function SaraRow({ result }: { result: NonNullable<ScanResult["signals"]>["saraConfluence"] }) {
  if (!result) return null;
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Price-Action Confirmation Confluence</p>
          <p className="text-xs text-muted">Closed-bar, multi-timeframe price-action confirmation.</p>
        </div>
        <Badge variant={ALIGNMENT_BADGE_VARIANT[result.alignment]}>
          {ALIGNMENT_LABEL[result.alignment]}
        </Badge>
      </div>
      {result.marketAdapterStatus === "unsupported" ? (
        <p className="mt-2 text-xs text-muted">{result.note}</p>
      ) : result.scenarioId ? (
        <p className="mt-2 text-xs text-muted">
          Armed scenario: {PATTERN_GLOSSARY_TERM[result.scenarioId]} ({result.direction}) —
          timeframe continuity {result.timeframeContinuity === "confirmed" ? "confirmed" : "not confirmed"}.
        </p>
      ) : (
        <p className="mt-2 text-xs text-muted">No armed scenario on the current closed-bar series.</p>
      )}
    </div>
  );
}

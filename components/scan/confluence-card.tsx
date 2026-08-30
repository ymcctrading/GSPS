import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
 * Gann Confluence Layer / Sara Sniper Strat Confluence Layer — additive
 * confluence reads from the addendum's cross-market integration (2026-08-28).
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
        <CardTitle>Gann &amp; Sara Confluence</CardTitle>
        <CardDescription>
          Gann Protocol is GSPS&apos;s North Star numerical/coordinate context; Sara Sniper Strat is
          a cross-market price-action confirmation module. Both are confluence factors on the GSPS
          Core signal above — alignment can improve rank, and material conflict can downgrade a
          setup, but neither alone produces or blocks a trade.
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
          <p className="text-sm font-medium">Gann Confluence Layer</p>
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
              <p className="text-muted">Nearest Square of 9</p>
              <p className="font-mono font-semibold">{result.nearestSquareOf9.price.toFixed(2)}</p>
            </div>
          )}
          {result.nearestFanLine && (
            <div className="rounded-md border border-border bg-surface p-2">
              <p className="text-muted">Nearest fan line</p>
              <p className="font-mono font-semibold">{result.nearestFanLine.angle}</p>
            </div>
          )}
          <div className="rounded-md border border-border bg-surface p-2">
            <p className="text-muted">Time cycle</p>
            <p className="font-mono font-semibold">{result.timeCycleActive ? "Active" : "None"}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function SaraRow({ result }: { result: NonNullable<ScanResult["signals"]>["saraConfluence"] }) {
  if (!result) return null;
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Sara Sniper Strat Confluence Layer</p>
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
          Armed scenario: {result.scenarioId} ({result.direction}) — timeframe continuity{" "}
          {result.timeframeContinuity === "confirmed" ? "confirmed" : "not confirmed"}.
        </p>
      ) : (
        <p className="mt-2 text-xs text-muted">No armed scenario on the current closed-bar series.</p>
      )}
    </div>
  );
}

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SCANNER_STATE_META, type RulesAlignmentTier, type ScannerStateName, type SignalVerdict } from "@/lib/signals/types";
import type { ScanResult } from "@/lib/types";

const STATE_ORDER: ScannerStateName[] = [
  "trendPullback",
  "trendBreakout",
  "confirmedReversal",
  "rangeReversion",
];

const TIER_LABEL: Record<RulesAlignmentTier, string> = {
  watchlistOnly: "Watchlist only",
  qualified: "Qualified",
  aTier: "A-tier",
  aPlusTier: "A+ tier",
};

const TIER_BADGE_VARIANT: Record<RulesAlignmentTier, "muted" | "default" | "bull"> = {
  watchlistOnly: "muted",
  qualified: "default",
  aTier: "bull",
  aPlusTier: "bull",
};

const REGIME_LABEL: Record<string, string> = {
  trend: "Trend",
  range: "Range",
  transition: "Transition",
  event: "Event / high uncertainty",
};

/**
 * The Signal and Regime Engine's own read — a separate decision layer from
 * the Protocol signal above, never combined with it or across its own four
 * states into a single verdict. Renders only what `redactScanResult` lets
 * cross the API boundary: score/tier/tradeable, never the per-criterion
 * breakdown that decided them, and never the engine's own entry, stop and
 * target, which are not Gann's (R-025): the Gann plan above is the plan.
 */
export function SignalRegimeCard({ result }: { result: ScanResult }) {
  const { signals } = result;
  if (!signals) return null;

  const { regime } = signals;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Signal &amp; Regime Engine</CardTitle>
          <Badge variant="muted">
            {REGIME_LABEL[regime.regime] ?? regime.regime}
            {regime.direction !== "sideways" ? ` · ${regime.direction}` : ""}
          </Badge>
        </div>
        <CardDescription>
          A separate read from the Protocol signal above — never combined into one verdict. Draft
          methodology; not a probability of profit.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {STATE_ORDER.map((name) => (
          <StateRow key={name} name={name} verdict={signals[name]} />
        ))}
      </CardContent>
    </Card>
  );
}

function StateRow({ name, verdict }: { name: ScannerStateName; verdict: SignalVerdict | null }) {
  const meta = SCANNER_STATE_META[name];

  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{meta.label}</p>
          <p className="text-xs text-muted">{meta.purpose}</p>
        </div>
        <StateStatusBadge verdict={verdict} />
      </div>

      {verdict?.status === "evaluated" && verdict.accountContextAssumed && (
        <p className="mt-2 text-xs text-muted">
          Market context only — account-specific checks (sizing, correlation, cooldown) aren&apos;t applied here.
        </p>
      )}

      {verdict?.status === "disqualified" && verdict.disqualifiers.length > 0 && (
        <p className="mt-2 text-xs text-muted">{verdict.disqualifiers[0].reason}</p>
      )}
    </div>
  );
}

function StateStatusBadge({ verdict }: { verdict: SignalVerdict | null }) {
  if (verdict === null) {
    return <Badge variant="muted">Not applicable</Badge>;
  }
  if (verdict.status === "notImplemented") {
    return <Badge variant="muted">Not available</Badge>;
  }
  if (verdict.status === "disqualified") {
    return <Badge variant="muted">Disqualified</Badge>;
  }

  return (
    <div className="flex items-center gap-1.5">
      {verdict.tradeable && <Badge variant="bull">Tradeable</Badge>}
      <Badge variant={TIER_BADGE_VARIANT[verdict.alignment.tier]}>{TIER_LABEL[verdict.alignment.tier]}</Badge>
    </div>
  );
}

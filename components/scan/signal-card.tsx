import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ScoreBadge } from "@/components/scan/score-badge";
import { Badge } from "@/components/ui/badge";
import { formatUsd } from "@/lib/utils";
import type { ScanResult } from "@/lib/types";
import { Check, X } from "lucide-react";

export function SignalCard({ result }: { result: ScanResult }) {
  const { decision, levels, pattern } = result;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Protocol signal</CardTitle>
          <ScoreBadge score={decision.score} state={decision.outputState} />
        </div>
        {pattern ? (
          <CardDescription>
            {pattern.name}{" "}
            <span className={pattern.direction === "bullish" ? "text-bull" : "text-bear"}>
              {pattern.direction}
            </span>{" "}
            — {pattern.description}
          </CardDescription>
        ) : (
          <CardDescription>No Strat pattern is currently armed on the execution timeframe.</CardDescription>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {levels && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <LevelStat label="Entry" value={formatUsd(levels.entry)} tone="accent" />
            <LevelStat label="Stop loss" value={formatUsd(levels.stopLoss)} tone="bear" />
            <LevelStat
              label={`TP1 (${levels.rewardToRiskTp1.toFixed(1)}R)`}
              value={formatUsd(levels.takeProfit1)}
              tone="bull"
            />
            <LevelStat
              label={`Master (${levels.rewardToRiskMaster.toFixed(1)}R)`}
              value={formatUsd(levels.masterProfit)}
              tone="bull"
            />
          </div>
        )}

        {levels?.stopBandWarning && <Badge variant="warn">{levels.stopBandWarning}</Badge>}

        <div>
          <h4 className="mb-2 text-sm font-medium">Score breakdown</h4>
          <ul className="flex flex-col gap-1.5">
            {decision.breakdown.map((b) => (
              <li key={b.criterion} className="flex items-start gap-2 text-sm">
                {b.passed ? (
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-bull" />
                ) : (
                  <X className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                )}
                <span>
                  <span className="font-medium">{b.criterion}.</span>{" "}
                  <span className="text-muted">{b.note}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

function LevelStat({ label, value, tone }: { label: string; value: string; tone: "accent" | "bull" | "bear" }) {
  const color = tone === "accent" ? "text-accent" : tone === "bull" ? "text-bull" : "text-bear";
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-0.5 font-mono text-sm font-semibold ${color}`}>{value}</p>
    </div>
  );
}

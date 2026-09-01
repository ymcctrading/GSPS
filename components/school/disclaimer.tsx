import { AlertTriangle } from "lucide-react";
import { NO_GUARANTEE_DISCLAIMER } from "@/lib/school/curriculum";

export type ScenarioBasis = "hypothetical" | "simulation" | "paper_trading" | "recorded_behavior";

const SCENARIO_LABEL: Record<ScenarioBasis, string> = {
  hypothetical: "Hypothetical scenario",
  simulation: "Simulation-based",
  paper_trading: "Paper-trading based",
  recorded_behavior: "Derived from your recorded GSPS activity",
};

export function SchoolDisclaimer({ scenarioBasis }: { scenarioBasis?: ScenarioBasis }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-warn/30 bg-warn-soft/40 p-3 text-xs text-muted">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" />
      <div className="space-y-1">
        <p>{NO_GUARANTEE_DISCLAIMER}</p>
        {scenarioBasis && (
          <p className="font-medium text-foreground">{SCENARIO_LABEL[scenarioBasis]} — not individualized investment advice.</p>
        )}
      </div>
    </div>
  );
}

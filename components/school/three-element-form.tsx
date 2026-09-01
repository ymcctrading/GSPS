"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { OPERATOR_ACTIONS, type OperatorAction } from "@/lib/school/bull-bear";

const ACTION_LABEL: Record<OperatorAction, string> = {
  no_trade: "No Trade",
  watchlist: "Watchlist",
  conditional_entry: "Conditional Entry",
  reduced_risk_entry: "Reduced-Risk Entry",
  standard_risk_entry: "Standard-Risk Entry",
  exit: "Exit",
  review_required: "Review Required",
};

export interface ThreeElementFormValue {
  signal: {
    instrument: string;
    timeframe: string;
    setupOrState: string;
    evidence: string;
    uncertainty: string;
    catalystOrEventContext: string;
    sourceProvenance: string;
  };
  bull: {
    thesis: string;
    supportingEvidence: string;
    confirmation: string;
    entryCondition: string;
    upsideScenario: string;
    target: string;
    thesisWeakeningConditions: string;
  };
  bear: {
    contradictoryEvidence: string;
    invalidation: string;
    hardStop: string;
    liquidityVolatilityEventRisk: string;
    positionSizeConsequence: string;
  };
  operator: {
    action: OperatorAction;
    nextObservableCondition: string;
    riskAction: string;
    reversalCondition: string;
  };
  regime?: {
    trendRangeTransition: "trend" | "range" | "transition" | "dislocation";
    volatilityState: string;
    liquidity: string;
    scheduledCatalyst: string;
    controllingTimeframe: string;
    conflictingTimeframeEvidence: string;
    disqualifier: string;
    actionState: OperatorAction;
  };
}

const EMPTY: ThreeElementFormValue = {
  signal: { instrument: "", timeframe: "", setupOrState: "", evidence: "", uncertainty: "", catalystOrEventContext: "", sourceProvenance: "" },
  bull: { thesis: "", supportingEvidence: "", confirmation: "", entryCondition: "", upsideScenario: "", target: "", thesisWeakeningConditions: "" },
  bear: { contradictoryEvidence: "", invalidation: "", hardStop: "", liquidityVolatilityEventRisk: "", positionSizeConsequence: "" },
  operator: { action: "no_trade", nextObservableCondition: "", riskAction: "", reversalCondition: "" },
};

function Field({ label, value, onChange, textarea }: { label: string; value: string; onChange: (v: string) => void; textarea?: boolean }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      {textarea ? (
        <textarea
          className="min-h-16 rounded-lg border border-border bg-background p-2 text-sm"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  );
}

/**
 * The reusable Signal / Mr. Bull's Case / Mrs. Bear's Challenge / The
 * Operator's Decision activity, used by the lesson player and /school/labs.
 * "Mr. Bull" and "Mrs. Bear" name two complementary decision functions —
 * initiative-hypothesis and discernment-falsification — not a claim about
 * gender; the Operator's Decision synthesis stays neutral.
 */
export function ThreeElementForm({
  requiresRegimeCheckpoint,
  onSubmit,
  submitting,
  errors,
}: {
  requiresRegimeCheckpoint: boolean;
  onSubmit: (value: ThreeElementFormValue) => void;
  submitting: boolean;
  errors: readonly string[];
}) {
  const [value, setValue] = useState<ThreeElementFormValue>(() => ({
    ...EMPTY,
    regime: requiresRegimeCheckpoint
      ? {
          trendRangeTransition: "range",
          volatilityState: "",
          liquidity: "",
          scheduledCatalyst: "",
          controllingTimeframe: "",
          conflictingTimeframeEvidence: "",
          disqualifier: "",
          actionState: "no_trade",
        }
      : undefined,
  }));

  function set<K extends keyof ThreeElementFormValue>(section: K, patch: Partial<ThreeElementFormValue[K]>) {
    setValue((v) => ({ ...v, [section]: { ...v[section], ...patch } }));
  }

  return (
    <div className="space-y-4">
      {requiresRegimeCheckpoint && value.regime && (
        <Card className="border-warn/40">
          <CardHeader>
            <CardTitle>Market-Regime Checkpoint</CardTitle>
            <CardDescription>Required before this activity can be submitted.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Structure</span>
              <select
                className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
                value={value.regime.trendRangeTransition}
                onChange={(e) => set("regime", { trendRangeTransition: e.target.value as never })}
              >
                <option value="trend">Trend</option>
                <option value="range">Range</option>
                <option value="transition">Transition</option>
                <option value="dislocation">Dislocation</option>
              </select>
            </label>
            <Field label="Volatility state" value={value.regime.volatilityState} onChange={(v) => set("regime", { volatilityState: v })} />
            <Field label="Liquidity" value={value.regime.liquidity} onChange={(v) => set("regime", { liquidity: v })} />
            <Field label="Scheduled catalyst (or 'none identified')" value={value.regime.scheduledCatalyst} onChange={(v) => set("regime", { scheduledCatalyst: v })} />
            <Field label="Controlling timeframe" value={value.regime.controllingTimeframe} onChange={(v) => set("regime", { controllingTimeframe: v })} />
            <Field label="Conflicting-timeframe evidence" value={value.regime.conflictingTimeframeEvidence} onChange={(v) => set("regime", { conflictingTimeframeEvidence: v })} />
            <Field label="Disqualifier (or 'none identified')" value={value.regime.disqualifier} onChange={(v) => set("regime", { disqualifier: v })} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>The Signal</CardTitle>
          <CardDescription>Observable market/system/research context — not a conclusion.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Field label="Instrument" value={value.signal.instrument} onChange={(v) => set("signal", { instrument: v })} />
          <Field label="Timeframe" value={value.signal.timeframe} onChange={(v) => set("signal", { timeframe: v })} />
          <Field label="Setup / state" value={value.signal.setupOrState} onChange={(v) => set("signal", { setupOrState: v })} textarea />
          <Field label="Evidence" value={value.signal.evidence} onChange={(v) => set("signal", { evidence: v })} textarea />
          <Field label="Uncertainty" value={value.signal.uncertainty} onChange={(v) => set("signal", { uncertainty: v })} textarea />
          <Field label="Catalyst / event context" value={value.signal.catalystOrEventContext} onChange={(v) => set("signal", { catalystOrEventContext: v })} />
          <Field label="Source / provenance" value={value.signal.sourceProvenance} onChange={(v) => set("signal", { sourceProvenance: v })} />
        </CardContent>
      </Card>

      <Card className="border-bull/40">
        <CardHeader>
          <CardTitle className="text-bull">Mr. Bull&apos;s Case</CardTitle>
          <CardDescription>Evidence-based opportunity hypothesis — no hype.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Field label="Thesis" value={value.bull.thesis} onChange={(v) => set("bull", { thesis: v })} textarea />
          <Field label="Supporting evidence" value={value.bull.supportingEvidence} onChange={(v) => set("bull", { supportingEvidence: v })} textarea />
          <Field label="Confirmation" value={value.bull.confirmation} onChange={(v) => set("bull", { confirmation: v })} />
          <Field label="Entry condition" value={value.bull.entryCondition} onChange={(v) => set("bull", { entryCondition: v })} />
          <Field label="Upside scenario" value={value.bull.upsideScenario} onChange={(v) => set("bull", { upsideScenario: v })} />
          <Field label="Target" value={value.bull.target} onChange={(v) => set("bull", { target: v })} />
          <Field label="Thesis-weakening conditions" value={value.bull.thesisWeakeningConditions} onChange={(v) => set("bull", { thesisWeakeningConditions: v })} textarea />
        </CardContent>
      </Card>

      <Card className="border-bear/40">
        <CardHeader>
          <CardTitle className="text-bear">Mrs. Bear&apos;s Challenge</CardTitle>
          <CardDescription>Falsify, constrain, protect capital. Must engage with something specific from the Bull case or Signal — a generic disclaimer will not pass.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Field label="Contradictory evidence" value={value.bear.contradictoryEvidence} onChange={(v) => set("bear", { contradictoryEvidence: v })} textarea />
          <Field label="Invalidation" value={value.bear.invalidation} onChange={(v) => set("bear", { invalidation: v })} />
          <Field label="Hard stop" value={value.bear.hardStop} onChange={(v) => set("bear", { hardStop: v })} />
          <Field label="Liquidity / volatility / event risk" value={value.bear.liquidityVolatilityEventRisk} onChange={(v) => set("bear", { liquidityVolatilityEventRisk: v })} />
          <Field label="Position-size consequence" value={value.bear.positionSizeConsequence} onChange={(v) => set("bear", { positionSizeConsequence: v })} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>The Operator&apos;s Decision</CardTitle>
          <CardDescription>Synthesize into controlled action.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Action</span>
            <select
              className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
              value={value.operator.action}
              onChange={(e) => set("operator", { action: e.target.value as OperatorAction })}
            >
              {OPERATOR_ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {ACTION_LABEL[a]}
                </option>
              ))}
            </select>
          </label>
          <Field label="Next observable condition" value={value.operator.nextObservableCondition} onChange={(v) => set("operator", { nextObservableCondition: v })} />
          <Field label="Risk action" value={value.operator.riskAction} onChange={(v) => set("operator", { riskAction: v })} />
          <Field label="Reversal condition" value={value.operator.reversalCondition} onChange={(v) => set("operator", { reversalCondition: v })} />
        </CardContent>
      </Card>

      {errors.length > 0 && (
        <div className="rounded-lg border border-bear/40 bg-bear-soft/30 p-3 text-sm text-bear">
          <p className="font-medium">Fix before submitting:</p>
          <ul className="ml-4 list-disc">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <Button onClick={() => onSubmit(value)} disabled={submitting}>
        {submitting ? "Submitting…" : "Submit"}
      </Button>
    </div>
  );
}

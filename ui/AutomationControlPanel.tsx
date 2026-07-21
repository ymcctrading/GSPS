/**
 * Automated Portfolio Manager control panel (System Mastery).
 *
 * Big, thumb-friendly dials for the mobile-first "Control Dial" screen:
 *  - master automation switch
 *  - risk profile selector (Passive / Moderate / Aggressive)
 *  - directional bias (Bullish / Bearish / Both)
 *  - volatility trigger with +/- increments ($ or %)
 *
 * Responsive web React (matches the Next.js app). Controlled component — wire
 * `value`/`onChange` to the `user_automation_profiles` row.
 */

import React from "react";

export type RiskProfile = "PASSIVE" | "MODERATE" | "AGGRESSIVE";
export type DirectionalBias = "BULLISH_ONLY" | "BEARISH_ONLY" | "BOTH";
export type VolatilityTriggerType = "PERCENTAGE" | "DOLLAR_AMOUNT";

export interface AutomationSettings {
  isAutomationEnabled: boolean;
  riskProfile: RiskProfile;
  directionalBias: DirectionalBias;
  volatilityTriggerType: VolatilityTriggerType;
  volatilityTriggerValue: number;
}

export interface AutomationControlPanelProps {
  value: AutomationSettings;
  onChange: (next: AutomationSettings) => void;
  step?: number; // increment for the +/- dial
}

const RISK: RiskProfile[] = ["PASSIVE", "MODERATE", "AGGRESSIVE"];
const BIAS: { key: DirectionalBias; label: string }[] = [
  { key: "BULLISH_ONLY", label: "BULLISH" },
  { key: "BEARISH_ONLY", label: "BEARISH" },
  { key: "BOTH", label: "BOTH" },
];

export function AutomationControlPanel({
  value,
  onChange,
  step = 0.5,
}: AutomationControlPanelProps) {
  const set = (patch: Partial<AutomationSettings>) =>
    onChange({ ...value, ...patch });

  const unit = value.volatilityTriggerType === "PERCENTAGE" ? "%" : "$";
  const adjust = (delta: number) =>
    set({
      volatilityTriggerValue: Math.max(
        0,
        Number((value.volatilityTriggerValue + delta).toFixed(2)),
      ),
    });

  return (
    <div className="mx-auto w-full max-w-md space-y-5 bg-[#0A0E17] p-4 text-white">
      {/* Master switch */}
      <div
        className={`rounded-2xl border p-5 ${
          value.isAutomationEnabled
            ? "border-[#4CD964] bg-[#1C2A3A]"
            : "border-transparent bg-[#161B22]"
        }`}
      >
        <div className="text-sm font-semibold text-[#8B949E]">
          Automated Portfolio Manager
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-base font-bold">
            {value.isAutomationEnabled
              ? "RUNNING HANDS-FREE"
              : "MANUAL EXECUTION ONLY"}
          </span>
          <Toggle
            on={value.isAutomationEnabled}
            onChange={(on) => set({ isAutomationEnabled: on })}
          />
        </div>
      </div>

      {/* Risk profile */}
      <Section title="Risk Allocation Profile">
        <SegmentedGroup
          options={RISK.map((r) => ({ key: r, label: r }))}
          selected={value.riskProfile}
          onSelect={(riskProfile) => set({ riskProfile })}
        />
      </Section>

      {/* Directional bias */}
      <Section title="Directional Bias">
        <SegmentedGroup
          options={BIAS}
          selected={value.directionalBias}
          onSelect={(directionalBias) => set({ directionalBias })}
        />
      </Section>

      {/* Volatility trigger */}
      <Section title="Volatility Trigger">
        <div className="flex items-center justify-between rounded-xl bg-[#161B22] p-3">
          <DialButton onClick={() => adjust(-step)}>− {step}{unit}</DialButton>
          <span className="font-mono text-lg font-bold">
            {value.volatilityTriggerValue.toFixed(1)} {unit}
          </span>
          <DialButton onClick={() => adjust(step)}>+ {step}{unit}</DialButton>
        </div>
        <div className="mt-2 flex gap-2">
          <TypeChip
            active={value.volatilityTriggerType === "PERCENTAGE"}
            onClick={() => set({ volatilityTriggerType: "PERCENTAGE" })}
          >
            % Move
          </TypeChip>
          <TypeChip
            active={value.volatilityTriggerType === "DOLLAR_AMOUNT"}
            onClick={() => set({ volatilityTriggerType: "DOLLAR_AMOUNT" })}
          >
            $ Amount
          </TypeChip>
        </div>
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#8B949E]">
        {title}
      </div>
      {children}
    </div>
  );
}

function SegmentedGroup<T extends string>({
  options,
  selected,
  onSelect,
}: {
  options: { key: T; label: string }[];
  selected: T;
  onSelect: (key: T) => void;
}) {
  return (
    <div className="flex gap-1 rounded-lg bg-[#161B22] p-1">
      {options.map((o) => {
        const active = o.key === selected;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onSelect(o.key)}
            className={`flex-1 rounded-md py-3 text-sm font-semibold transition-colors ${
              active ? "bg-[#21262D] text-[#58A6FF]" : "text-[#8B949E]"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Toggle({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`relative h-7 w-12 rounded-full transition-colors ${
        on ? "bg-[#4CD964]" : "bg-[#767577]"
      }`}
    >
      <span
        className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition-transform ${
          on ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function DialButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md bg-[#21262D] px-4 py-2.5 text-sm font-semibold text-white"
    >
      {children}
    </button>
  );
}

function TypeChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-md py-2 text-xs font-semibold ${
        active ? "bg-[#21262D] text-[#58A6FF]" : "bg-[#161B22] text-[#8B949E]"
      }`}
    >
      {children}
    </button>
  );
}

export default AutomationControlPanel;

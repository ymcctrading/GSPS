"use client";

import { useEffect, useState } from "react";
import {
  AutomationControlPanel,
  type AutomationSettings,
} from "@/ui/AutomationControlPanel";

const STORAGE_KEY = "gsps_automation_settings";

const DEFAULTS: AutomationSettings = {
  isAutomationEnabled: false,
  riskProfile: "MODERATE",
  directionalBias: "BOTH",
  volatilityTriggerType: "PERCENTAGE",
  volatilityTriggerValue: 2.0,
};

/**
 * System Mastery control hub. Persists the automation dials to localStorage so
 * the owner's configuration survives reloads without a login. When Supabase auth
 * (or the owner service session) is wired, swap load/save for
 * user_automation_profiles.
 */
export function AutomationDashboard() {
  const [settings, setSettings] = useState<AutomationSettings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setSettings({ ...DEFAULTS, ...JSON.parse(raw) });
    } catch {
      /* ignore */
    }
    setLoaded(true);
  }, []);

  function update(next: AutomationSettings) {
    setSettings(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  if (!loaded) {
    return <div className="h-64 animate-pulse rounded-xl bg-slate-100" />;
  }

  const biasLabel =
    settings.directionalBias === "BOTH"
      ? "Bullish & Bearish"
      : settings.directionalBias === "BULLISH_ONLY"
        ? "Bullish only"
        : "Bearish only";
  const unit = settings.volatilityTriggerType === "PERCENTAGE" ? "%" : "$";

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="rounded-xl border border-[var(--border)] bg-[#0A0E17] p-1 shadow-sm">
        <AutomationControlPanel value={settings} onChange={update} />
      </div>

      <div className="space-y-4">
        <div
          className={`rounded-xl border p-5 shadow-sm ${
            settings.isAutomationEnabled
              ? "border-brand-up bg-green-50"
              : "border-[var(--border)] bg-white"
          }`}
        >
          <h2 className="text-lg font-semibold">Automation status</h2>
          <p className="mt-1 text-sm text-slate-600">
            {settings.isAutomationEnabled
              ? "Running hands-free — the engine will manage entries, trailing stops, and exits based on your dials."
              : "Manual execution only. Flip the master switch to hand control to the engine."}
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <Stat label="Risk profile" value={settings.riskProfile} />
            <Stat label="Directional bias" value={biasLabel} />
            <Stat
              label="Volatility trigger"
              value={`${settings.volatilityTriggerValue.toFixed(1)} ${unit}`}
            />
            <Stat
              label="Mode"
              value={settings.isAutomationEnabled ? "AUTONOMOUS" : "MANUAL"}
            />
          </dl>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Active algorithmic deployments</h2>
          <p className="mt-1 text-sm text-slate-500">
            Positions the engine is actively managing appear here once automation is
            live and setups trigger.
          </p>
          <div className="mt-4 rounded-lg border border-dashed border-[var(--border)] py-8 text-center text-sm text-slate-400">
            No active deployments yet.
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-white/70 p-3">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 font-semibold">{value}</dd>
    </div>
  );
}

export default AutomationDashboard;

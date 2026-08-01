"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type RiskProfile = "PASSIVE" | "MODERATE" | "AGGRESSIVE";
type DirectionalBias = "BULLISH_ONLY" | "BEARISH_ONLY" | "BOTH";
type TriggerType = "PERCENTAGE" | "DOLLAR_AMOUNT";

export interface AutomationProfile {
  is_automation_enabled: boolean;
  risk_profile: RiskProfile;
  directional_bias: DirectionalBias;
  volatility_trigger_type: TriggerType;
  volatility_trigger_value: number;
}

const RISK: RiskProfile[] = ["PASSIVE", "MODERATE", "AGGRESSIVE"];
const BIAS: { key: DirectionalBias; label: string }[] = [
  { key: "BULLISH_ONLY", label: "Bullish" },
  { key: "BEARISH_ONLY", label: "Bearish" },
  { key: "BOTH", label: "Both" },
];

export function AutomationControlPanel({
  userId,
  initial,
}: {
  userId: string;
  initial: AutomationProfile;
}) {
  const [profile, setProfile] = useState<AutomationProfile>(initial);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  async function persist(next: AutomationProfile) {
    setProfile(next);
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("user_automation_profiles")
      .upsert({ user_id: userId, ...next, updated_at: new Date().toISOString() });
    setSaving(false);
    if (!error) setSavedAt(new Date().toLocaleTimeString());
  }

  const unit = profile.volatility_trigger_type === "PERCENTAGE" ? "%" : "$";
  const adjust = (delta: number) =>
    persist({
      ...profile,
      volatility_trigger_value: Math.max(
        0,
        Number((profile.volatility_trigger_value + delta).toFixed(2)),
      ),
    });

  return (
    <div className="flex flex-col gap-4">
      <Card className={cn(profile.is_automation_enabled && "border-bull")}>
        <CardHeader>
          <CardTitle>Automated Portfolio Manager</CardTitle>
          <CardDescription>
            {profile.is_automation_enabled
              ? "Running hands-free — the engine manages entries, trailing stops, and exits."
              : "Manual execution only. Flip the switch to hand control to the engine."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <button
            type="button"
            role="switch"
            aria-checked={profile.is_automation_enabled}
            onClick={() =>
              persist({ ...profile, is_automation_enabled: !profile.is_automation_enabled })
            }
            className={cn(
              "relative h-8 w-14 rounded-full transition-colors",
              profile.is_automation_enabled ? "bg-bull" : "bg-border",
            )}
          >
            <span
              className={cn(
                "absolute top-1 h-6 w-6 rounded-full bg-white transition-transform",
                profile.is_automation_enabled ? "translate-x-7" : "translate-x-1",
              )}
            />
          </button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Risk allocation</CardTitle>
          <CardDescription>Max equity risked per automated trade.</CardDescription>
        </CardHeader>
        <CardContent>
          <Segmented
            options={RISK.map((r) => ({ key: r, label: r }))}
            selected={profile.risk_profile}
            onSelect={(risk_profile) => persist({ ...profile, risk_profile })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Directional bias</CardTitle>
          <CardDescription>Which reversion setups the engine may take.</CardDescription>
        </CardHeader>
        <CardContent>
          <Segmented
            options={BIAS}
            selected={profile.directional_bias}
            onSelect={(directional_bias) => persist({ ...profile, directional_bias })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Volatility trigger</CardTitle>
          <CardDescription>Only deploy when a move exceeds this threshold.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={() => adjust(-0.5)}>
              − 0.5{unit}
            </Button>
            <span className="font-mono text-lg font-semibold">
              {profile.volatility_trigger_value.toFixed(1)} {unit}
            </span>
            <Button variant="outline" size="sm" onClick={() => adjust(0.5)}>
              + 0.5{unit}
            </Button>
          </div>
          <Segmented
            options={[
              { key: "PERCENTAGE", label: "% Move" },
              { key: "DOLLAR_AMOUNT", label: "$ Amount" },
            ]}
            selected={profile.volatility_trigger_type}
            onSelect={(volatility_trigger_type) =>
              persist({ ...profile, volatility_trigger_type })
            }
          />
        </CardContent>
      </Card>

      <p className="text-xs text-muted">
        {saving ? "Saving…" : savedAt ? `Saved at ${savedAt}` : "Changes save automatically."}
      </p>
    </div>
  );
}

function Segmented<T extends string>({
  options,
  selected,
  onSelect,
}: {
  options: { key: T; label: string }[];
  selected: T;
  onSelect: (key: T) => void;
}) {
  return (
    <div className="flex gap-1 rounded-lg border border-border bg-background p-1">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onSelect(o.key)}
          className={cn(
            "flex-1 rounded-md py-2 text-sm font-medium transition-colors cursor-pointer",
            o.key === selected ? "bg-accent-soft text-accent" : "text-muted hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

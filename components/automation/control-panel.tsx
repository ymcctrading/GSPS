"use client";

import { Switch } from "@/components/gann/switch";
import { useTradeRulePrefs } from "@/components/gann/use-gann-rule-prefs";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type RiskProfile = "PASSIVE" | "MODERATE" | "AGGRESSIVE";
type DirectionalBias = "BULLISH_ONLY" | "BEARISH_ONLY" | "BOTH";
type TriggerType = "PERCENTAGE" | "DOLLAR_AMOUNT";
type ExecutionMode = "paper" | "live";

export interface AutomationProfile {
  is_automation_enabled: boolean;
  risk_profile: RiskProfile;
  directional_bias: DirectionalBias;
  volatility_trigger_type: TriggerType;
  volatility_trigger_value: number;
  execution_mode: ExecutionMode;
  pivot_on_stop_out: boolean;
  /** Most one automated trade may cost, in dollars; null = no limit (migration 0140). */
  max_trade_dollars: number | null;
}

const RISK: RiskProfile[] = ["PASSIVE", "MODERATE", "AGGRESSIVE"];
const BIAS: { key: DirectionalBias; label: string }[] = [
  { key: "BULLISH_ONLY", label: "Buy" },
  { key: "BEARISH_ONLY", label: "Sell" },
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
              ? `Running hands-free in ${profile.execution_mode} trading — the engine scans for armed plans matching your dials and manages entries, stops, and exits automatically.`
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
          <CardTitle>Execution mode</CardTitle>
          <CardDescription>
            Live requires a connected live broker account and is not yet authorized on this
            deployment — see the note below. Selecting it now saves the preference; the engine
            keeps trading paper on your behalf until both are in place.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Segmented
            options={[
              { key: "paper", label: "Paper" },
              { key: "live", label: "Live" },
            ]}
            selected={profile.execution_mode}
            onSelect={(execution_mode) => persist({ ...profile, execution_mode })}
          />
          {profile.execution_mode === "live" && (
            <p className="rounded border border-warn/40 bg-warn-soft px-3 py-2 text-xs text-warn">
              Live autonomous execution is gated behind a dedicated kill switch and an explicit
              authorization record on this deployment (see docs/
              AUTOMATED_PORTFOLIO_MANAGER_LIVE_REVIEW.md). Until both are in place, the engine
              continues placing paper trades even with Live selected here — nothing changes about
              your real account.
            </p>
          )}
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

      <TradeLimitCard
        value={profile.max_trade_dollars}
        onSave={(max_trade_dollars) => persist({ ...profile, max_trade_dollars })}
      />

      <Card>
        <CardHeader>
          <CardTitle>Directional bias</CardTitle>
          <CardDescription>Which setups the engine may take.</CardDescription>
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

      <Card>
        <CardHeader>
          <CardTitle>Reverse when caught</CardTitle>
          <CardDescription>
            When one of the engine&apos;s own trades is stopped, or the trend turns against it, the
            engine prepares the opposite trade: entry at the level that broke, stop just beyond
            the old trade&apos;s high or low. It still has to confirm before it is placed, like every
            entry. A trade that only failed its first test is taken off, not reversed.
          </CardDescription>
        </CardHeader>
      </Card>

      <RoundNumberAutomationCard />

      <p className="text-xs text-muted">
        {saving ? "Saving…" : savedAt ? `Saved at ${savedAt}` : "Changes save automatically."}
      </p>
    </div>
  );
}

/**
 * The per-trade dollar limit (lib/automation/tradeDollarCap.ts): the most one
 * automated trade may cost. Blank means no limit. It only ever buys fewer
 * shares; the stop and the plan stay the same.
 */
function TradeLimitCard({ value, onSave }: { value: number | null; onSave: (next: number | null) => void }) {
  const [draft, setDraft] = useState(value == null ? "" : String(value));
  const [invalid, setInvalid] = useState(false);
  function commit() {
    const text = draft.trim().replace(/[$,]/g, "");
    if (text === "") {
      setInvalid(false);
      if (value != null) onSave(null);
      return;
    }
    const n = Number(text);
    if (!Number.isFinite(n) || n <= 0) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    const rounded = Math.round(n * 100) / 100;
    setDraft(String(rounded));
    if (rounded !== value) onSave(rounded);
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Limit per trade</CardTitle>
        <CardDescription>
          The most one automated trade may cost. The engine buys fewer shares to stay under it, and skips a
          stock when one share costs more. Leave blank for no limit.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <label className="flex items-center gap-2">
          <span className="font-mono text-lg">$</span>
          <input
            type="text"
            inputMode="decimal"
            aria-label="Limit per trade in dollars"
            placeholder="No limit"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
            }}
            className="w-40 rounded-md border border-border bg-background px-3 py-2 font-mono"
          />
        </label>
        {invalid && <p className="text-xs text-bear">Enter a dollar amount above zero, or leave it blank.</p>}
      </CardContent>
    </Card>
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

/**
 * Gann's even figures for the autonomous portfolio manager (owner,
 * 2026-09-28): off by default, the manager won't auto-place an entry just
 * short of a round number unless the plan's own breakout level is that
 * number. Stored with the trader's other rule switches (lib/gann/traderPrefs.ts).
 */
function RoundNumberAutomationCard() {
  const { prefs, error, save } = useTradeRulePrefs();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Auto-order at round numbers</CardTitle>
        <CardDescription>
          Orders gather at round numbers like 50, 100 or 200, and moves often stall just short of them.
          While this is off, the engine won&apos;t place an entry just below (or, for a short, just
          above) a round number unless the plan&apos;s own breakout level is that number.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Switch
          label="Auto-order at round numbers"
          checked={prefs.autoOrderRoundNumbers}
          onChange={() => save({ autoOrderRoundNumbers: !prefs.autoOrderRoundNumbers })}
        />
        {error && <p className="mt-2 text-xs text-bear">{error}</p>}
      </CardContent>
    </Card>
  );
}

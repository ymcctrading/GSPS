import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserTier, hasFeature } from "@/lib/tiers";
import { UpgradeCard } from "@/components/app/upgrade-card";
import {
  AutomationControlPanel,
  type AutomationProfile,
} from "@/components/automation/control-panel";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export const metadata = {
  title: "Automation — GSPS",
  description: "Hands-free automated portfolio manager (System Mastery).",
};

const DEFAULT_PROFILE: AutomationProfile = {
  is_automation_enabled: false,
  risk_profile: "MODERATE",
  directional_bias: "BOTH",
  volatility_trigger_type: "PERCENTAGE",
  volatility_trigger_value: 2.0,
};

export default async function AutomationPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const tier = await getUserTier(supabase, user.id);
  const unlocked = hasFeature(tier, "autonomous_portfolio_manager");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Automated Portfolio Manager</h1>
        <p className="text-sm text-muted">
          Hand execution to the engine — set your risk, bias, and volatility dials and it manages
          entries, trailing stops, and exits hands-free.
        </p>
      </div>

      {!unlocked ? (
        <UpgradeCard
          feature="autonomous_portfolio_manager"
          title="System Mastery — Autonomous Portfolio Manager"
          blurb="Automate the full trade lifecycle across stocks, options, futures, crypto, and forex: dynamic trailing stops, hard stop-losses, and directional/volatility controls."
        />
      ) : (
        <AutomationHub userId={user.id} supabase={supabase} />
      )}
    </div>
  );
}

async function AutomationHub({
  userId,
  supabase,
}: {
  userId: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
}) {
  const { data } = await supabase
    .from("user_automation_profiles")
    .select(
      "is_automation_enabled, risk_profile, directional_bias, volatility_trigger_type, volatility_trigger_value",
    )
    .eq("user_id", userId)
    .maybeSingle();

  const initial: AutomationProfile = { ...DEFAULT_PROFILE, ...(data ?? {}) };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <AutomationControlPanel userId={userId} initial={initial} />
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Active algorithmic deployments</CardTitle>
            <CardDescription>
              Positions the engine is actively managing appear here once automation is live and
              setups trigger.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted">
              No active deployments yet.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

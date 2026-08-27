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
    <div className="flex min-w-0 flex-col gap-4 sm:gap-6">
      <div>
        <h1 className="text-xl font-semibold sm:text-2xl">Automated Portfolio Manager</h1>
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

interface CritiquedTrade {
  id: string;
  symbol: string;
  direction: "buy" | "sell";
  outcome: "profit" | "loss" | "pending" | null;
  profit_loss_dollars: number | null;
  exit_timestamp: string | null;
  critique: string | null;
}

/**
 * The account's own closed, automated trades with their LLM critiques
 * (lib/demo/critique.ts) attached — real activity, once there is any,
 * instead of the static placeholder below. Every account reads its own
 * rows here, not just the demo profile: this is the same infrastructure a
 * future paid autonomous-manager account would show its trades through.
 */
async function recentCritiquedTrades(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<CritiquedTrade[]> {
  const { data: critiques } = await supabase
    .from("trade_critiques")
    .select("trade_log_id, critique")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);
  const rows = (critiques ?? []) as { trade_log_id: string; critique: string }[];
  if (rows.length === 0) return [];

  const { data: trades } = await supabase
    .from("trade_logs")
    .select("id, symbol, direction, outcome, profit_loss_dollars, exit_timestamp")
    .in(
      "id",
      rows.map((r) => r.trade_log_id),
    );
  const bySymbolId = new Map((trades ?? []).map((t) => [t.id as string, t]));

  return rows
    .map((r) => {
      const trade = bySymbolId.get(r.trade_log_id);
      if (!trade) return null;
      return { ...trade, critique: r.critique } as CritiquedTrade;
    })
    .filter((t): t is CritiquedTrade => t !== null);
}

async function AutomationHub({
  userId,
  supabase,
}: {
  userId: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
}) {
  const [{ data }, trades] = await Promise.all([
    supabase
      .from("user_automation_profiles")
      .select(
        "is_automation_enabled, risk_profile, directional_bias, volatility_trigger_type, volatility_trigger_value",
      )
      .eq("user_id", userId)
      .maybeSingle(),
    recentCritiquedTrades(supabase, userId),
  ]);

  const initial: AutomationProfile = { ...DEFAULT_PROFILE, ...(data ?? {}) };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <AutomationControlPanel userId={userId} initial={initial} />
      <div className="flex flex-col gap-4">
        <Card data-tour="automation-deployments">
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

        <Card>
          <CardHeader>
            <CardTitle>Recent automated trades</CardTitle>
            <CardDescription>
              Closed trades this engine placed, with a short writeup of why each was taken and how
              it played out.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {trades.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted">
                No critiqued trades yet.
              </div>
            ) : (
              <ul className="flex flex-col gap-4">
                {trades.map((t) => (
                  <li key={t.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between text-sm font-medium">
                      <span>
                        {t.symbol} · {t.direction === "buy" ? "Long" : "Short"}
                      </span>
                      <span className={t.outcome === "profit" ? "text-bull" : "text-bear"}>
                        {t.profit_loss_dollars != null
                          ? `${t.profit_loss_dollars >= 0 ? "+" : ""}$${t.profit_loss_dollars.toFixed(2)}`
                          : "—"}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-muted">{t.critique}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

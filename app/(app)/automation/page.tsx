import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserTier, hasFeature } from "@/lib/tiers";
import { getUserEntitlementPolicy } from "@/lib/entitlements/policy";
import { UpgradeCard } from "@/components/app/upgrade-card";
import {
  AutomationControlPanel,
  type AutomationProfile,
} from "@/components/automation/control-panel";
import {
  GspsPlanAutomation,
  type AutomationProfileSummary,
  type EligiblePlanSummary,
} from "@/components/automation/gsps-plan-automation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { matchesDirectionalBias } from "@/lib/automation/portfolio-manager";
import { loadDeployments, type Deployment } from "@/lib/automation/deployments";
import { formatUsd } from "@/lib/utils";

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
  execution_mode: "paper",
  pivot_on_stop_out: false,
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

      <GspsAutomationSection userId={user.id} supabase={supabase} />
    </div>
  );
}

/**
 * Wall-Street-only, plan-scoped GSPS Automation — gated on
 * `automationEnabled` (the entitlement policy's own "Wall Street" check,
 * lib/entitlements/policy.ts), independent of the System Mastery /
 * `autonomous_portfolio_manager` gate above. A member without this
 * entitlement sees a short locked note rather than the full UpgradeCard
 * again, since that card already covers this page once above.
 */
async function GspsAutomationSection({
  userId,
  supabase,
}: {
  userId: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
}) {
  const policy = await getUserEntitlementPolicy(supabase, userId);
  if (!policy.automationEnabled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>GSPS Automation</CardTitle>
          <CardDescription>
            Activating automation against a specific GSPS candidate plan, in paper or live mode,
            requires Wall Street entitlement.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const [plansResult, profilesResult] = await Promise.all([
    supabase
      .from("trade_plans")
      .select("plan_id, instrument, direction, state, entry_trigger, invalidation, take_profit_1")
      .eq("user_id", userId)
      .in("state", ["armed", "entered", "tp1_reached", "tp2_reached", "master_reached", "runner"])
      .order("generated_at", { ascending: false })
      .limit(50),
    supabase
      .from("automation_profiles")
      .select("profile_id, plan_id, automation_mode, execution_mode, status, configuration")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
  ]);

  const eligiblePlans: EligiblePlanSummary[] = (plansResult.data ?? []).map((row) => ({
    planId: row.plan_id as string,
    instrument: row.instrument as string,
    direction: row.direction as "bullish" | "bearish",
    state: row.state as string,
    entryTrigger: Number(row.entry_trigger),
    invalidation: Number(row.invalidation),
    takeProfit1: Number(row.take_profit_1),
  }));
  const profiles = (profilesResult.data ?? []) as AutomationProfileSummary[];

  return <GspsPlanAutomation eligiblePlans={eligiblePlans} profiles={profiles} />;
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

interface WatchingSetup {
  planId: string;
  symbol: string;
  direction: "bullish" | "bearish";
  checklistSteps: number;
  generatedAt: string;
}

/**
 * The stages `lib/lifecycle/entryConfirmation.ts` populates on
 * `trade_plans.entry_confirmation` before `entryReady()` allows a plan to
 * arm. Since PLAN.md item 4 that is the crossing rule's two: price reaches 3
 * points past the old level, then closes there. The order then rests for the
 * reaction. Counting how many are non-null gives an honest 0-2 readout.
 */
const ENTRY_CONFIRMATION_STAGES = ["touchedAt", "breakOrSweepAt"] as const;
const MAX_WATCHING = 9;

function countChecklistSteps(entryConfirmation: unknown): number {
  if (!entryConfirmation || typeof entryConfirmation !== "object") return 0;
  const evidence = entryConfirmation as Record<string, unknown>;
  return ENTRY_CONFIRMATION_STAGES.filter((key) => evidence[key] != null).length;
}

/**
 * Setups the engine has already flagged tradeable (EXECUTE) and is now
 * tracking until price closes 3 points past the old level (or, for a
 * double or triple bottom, until it rests at the old level)
 * before it will arm and place a trade — this is the "not idle, here's what
 * it's watching" surface for the Automated Portfolio Manager. Only plans in
 * `awaiting_entry_confirmation` are shown: `watchlist`/`qualified` are
 * pre-EXECUTE or momentary states with no real checklist progress yet, and
 * `armed`+ already appear under "Open positions" (waiting to enter) once taken.
 */
async function watchingSetups(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  directionalBias: AutomationProfile["directional_bias"],
): Promise<WatchingSetup[]> {
  const { data } = await supabase
    .from("trade_plans")
    .select("plan_id, instrument, direction, entry_confirmation, generated_at")
    .eq("user_id", userId)
    .eq("state", "awaiting_entry_confirmation")
    .order("generated_at", { ascending: false })
    .limit(50);

  const rows = (data ?? []) as {
    plan_id: string;
    instrument: string;
    direction: "bullish" | "bearish";
    entry_confirmation: unknown;
    generated_at: string;
  }[];

  return rows
    .filter((r) => matchesDirectionalBias(r.direction, directionalBias))
    .map((r) => ({
      planId: r.plan_id,
      symbol: r.instrument,
      direction: r.direction,
      checklistSteps: countChecklistSteps(r.entry_confirmation),
      generatedAt: r.generated_at,
    }))
    .sort((a, b) => b.checklistSteps - a.checklistSteps || b.generatedAt.localeCompare(a.generatedAt))
    .slice(0, MAX_WATCHING);
}

async function AutomationHub({
  userId,
  supabase,
}: {
  userId: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
}) {
  const [{ data }, trades, deployments] = await Promise.all([
    supabase
      .from("user_automation_profiles")
      .select(
        "is_automation_enabled, risk_profile, directional_bias, volatility_trigger_type, volatility_trigger_value, execution_mode, pivot_on_stop_out",
      )
      .eq("user_id", userId)
      .maybeSingle(),
    recentCritiquedTrades(supabase, userId),
    loadDeployments(supabase, userId),
  ]);

  const initial: AutomationProfile = { ...DEFAULT_PROFILE, ...(data ?? {}) };
  const watching = await watchingSetups(supabase, userId, initial.directional_bias);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <AutomationControlPanel userId={userId} initial={initial} />
      <div className="flex flex-col gap-4">
        <Card data-tour="automation-watching">
          <CardHeader>
            <CardTitle>Watching</CardTitle>
            <CardDescription>
              {watching.length > 0
                ? `${watching.length} setup${watching.length === 1 ? "" : "s"} the engine has flagged tradeable and is tracking through the entry checklist — nothing executes until each one clears it.`
                : "The engine scans on a schedule and flags a setup here the moment one is strong enough to track toward entry."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {watching.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted">
                Nothing is currently confirming toward entry. Check back after the next scan.
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {watching.map((w) => (
                  <li
                    key={w.planId}
                    className="flex items-center justify-between rounded-lg border border-border px-4 py-3 text-sm"
                  >
                    <span className="font-medium">
                      {w.symbol} · {w.direction === "bullish" ? "Long" : "Short"}
                    </span>
                    <span className="flex items-center gap-2 text-muted">
                      <span className="flex gap-1" aria-hidden="true">
                        {ENTRY_CONFIRMATION_STAGES.map((stage, i) => (
                          <span
                            key={stage}
                            className={`h-1.5 w-4 rounded-full ${i < w.checklistSteps ? "bg-accent" : "bg-border"}`}
                          />
                        ))}
                      </span>
                      <span>{w.checklistSteps}/{ENTRY_CONFIRMATION_STAGES.length} checklist</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card data-tour="automation-deployments">
          <CardHeader>
            <CardTitle>Open positions</CardTitle>
            <CardDescription>
              Trades the engine has entered and is managing on its trailing stops. Below them, the
              entries still waiting and the plans that ended before they filled.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <DeploymentGroup
              rows={deployments.filter((d) => d.status === "open")}
              empty="No open positions. Nothing the engine activated has filled yet."
            />
            <DeploymentGroup title="Waiting to enter" rows={deployments.filter((d) => d.status === "waiting")} />
            <DeploymentGroup title="Closed" rows={deployments.filter((d) => d.status === "closed")} />
            <DeploymentGroup title="Ended without a fill" rows={deployments.filter((d) => d.status === "ended")} />
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

function levels(d: Deployment): string {
  const parts = [
    d.stop !== null ? `Stop ${formatUsd(d.stop)}` : null,
    d.takeProfit1 !== null ? `TP1 ${formatUsd(d.takeProfit1)}` : null,
    d.masterProfit !== null ? `MTP ${formatUsd(d.masterProfit)}` : null,
  ];
  return parts.filter(Boolean).join(" · ");
}

function detailLine(d: Deployment): string {
  if (d.status === "open" || d.status === "closed") {
    const fill = d.fillPrice !== null ? `${d.qty ?? "?"} shares at ${formatUsd(d.fillPrice)}` : "Filled";
    const when = d.filledAt ? ` on ${new Date(d.filledAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" })}` : "";
    return `${fill}${when}`;
  }
  if (d.restingLimit !== null) return `Order resting at ${formatUsd(d.restingLimit)}`;
  const entry = d.entry !== null ? `Entry ${formatUsd(d.entry)}` : "Entry not priced";
  return d.status === "ended" ? `${entry} · the plan ${d.planState === "expired" ? "expired" : "ended"} before it filled` : entry;
}

/** One group of automation activations (`lib/automation/deployments.ts`). */
function DeploymentGroup({ title, rows, empty }: { title?: string; rows: Deployment[]; empty?: string }) {
  if (rows.length === 0) {
    if (!empty) return null;
    return (
      <div className="rounded-lg border border-dashed border-border py-6 text-center text-sm text-muted">{empty}</div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {title ? <p className="text-xs font-medium uppercase tracking-wide text-muted">{title}</p> : null}
      <ul className="flex flex-col gap-2">
        {rows.map((d) => (
          <li key={d.profileId} className="flex flex-col gap-1 rounded-lg border border-border px-4 py-3 text-sm">
            <span className="flex items-center justify-between gap-2">
              <span className="font-medium">
                {d.symbol} · {d.direction === "bullish" ? "Long" : "Short"}
              </span>
              <span className="text-xs text-muted">{d.executionMode}</span>
            </span>
            <span className="text-muted">{detailLine(d)}</span>
            {d.status !== "ended" && levels(d) ? <span className="text-muted">{levels(d)}</span> : null}
            {d.lastReason ? <span className="text-xs text-muted">Latest: {d.lastReason}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

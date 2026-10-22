import Link from "next/link";
import { TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createServiceClient } from "@/lib/supabase/server";
import { getEntitlementPolicy, type EntitlementPolicy } from "@/lib/entitlements/policy";
import { TIER_META } from "@/lib/tiers";
import { PRACTICE_STARTING_CASH, PRACTICE_TIERS, listPracticeAccounts, type PracticeTier } from "@/lib/demo/practice";

export const metadata = {
  title: "Practice accounts — GSPS",
  description: "Open a paper-money practice account for any GSPS tier, traded on GSPS's own signals, before you sign up or upgrade.",
};

// The record below is read live on every visit.
export const dynamic = "force-dynamic";

/**
 * Public page listing one practice account per tier (lib/demo/practice.ts).
 * Each card says what the tier includes, read from the entitlement policy (the
 * one place those numbers live), and the account's own record so far: closed
 * trades, wins and losses, realised P&L and open positions, paper money, losses
 * shown with the wins ("Only the real"). The button opens that account in this
 * browser through /api/demo/open.
 */

interface PracticeRecord {
  cash: number | null;
  /** Latest equity mark (cash plus open positions at market), when recorded. */
  equity: { value: number; at: string } | null;
  closed: number;
  wins: number;
  losses: number;
  realized: number;
  open: number;
}

async function readRecords(): Promise<Map<string, PracticeRecord>> {
  const out = new Map<string, PracticeRecord>();
  try {
    const service = createServiceClient();
    const accounts = await listPracticeAccounts(service);
    await Promise.all(
      accounts.map(async ({ userId, tier }) => {
        const [cashRes, tradesRes, openRes, markRes] = await Promise.all([
          service.from("paper_accounts").select("cash").eq("user_id", userId).maybeSingle(),
          // Every closed trade: a pending row is still open.
          service.from("trade_logs").select("outcome, profit_loss_dollars").eq("user_id", userId).eq("mode", "paper").not("outcome", "is", null).neq("outcome", "pending"),
          service.from("positions").select("id", { count: "exact", head: true }).eq("user_id", userId),
          service
            .from("paper_equity_snapshots")
            .select("equity, recorded_at")
            .eq("profile_id", userId)
            .order("session_date", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);
        const mark = markRes.data as { equity: number | string; recorded_at: string } | null;
        const trades = (tradesRes.data ?? []) as { outcome: string; profit_loss_dollars: number | string | null }[];
        out.set(tier.slug, {
          cash: cashRes.data ? Number((cashRes.data as { cash: number | string }).cash) : null,
          equity: mark ? { value: Number(mark.equity), at: mark.recorded_at } : null,
          closed: trades.length,
          wins: trades.filter((t) => t.outcome === "profit").length,
          losses: trades.filter((t) => t.outcome === "loss").length,
          realized: trades.reduce((sum, t) => sum + (Number(t.profit_loss_dollars) || 0), 0),
          open: openRes.count ?? 0,
        });
      }),
    );
  } catch (err) {
    console.error(`practice page: record not read — ${err instanceof Error ? err.message : String(err)}`);
  }
  return out;
}

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const limit = (l: number | "unlimited") => (l === "unlimited" ? "Unlimited" : String(l));

function includes(p: EntitlementPolicy): string[] {
  const modes = p.allowedStrategyModes === "all" ? "All nine Strategy Modes" : p.allowedStrategyModes.length ? `${p.allowedStrategyModes.length} Strategy Modes` : "GSPS's own trade plan only";
  const intraday = p.intradayScansEnabled
    ? `Intraday scans (${limit(p.intradayRefreshesPerDay)} refreshes a day)`
    : p.proIntradayModuleEnabled
      ? `Pro intraday module (${limit(p.intradayRefreshesPerDay)} refreshes a day)`
      : "No intraday scans";
  return [
    `Up to ${p.maxDashboardSetupsPerScan} setups a scan`,
    intraday,
    modes,
    p.backtestingEnabled ? "Backtesting" : "No backtesting",
    p.automationEnabled ? "Automation and the portfolio manager" : "No automation",
    p.percentRiskCeilings ? "Guard-rail position ceilings on every order" : "Sized by the method's capital rules",
  ];
}

function PracticeCard({ practice, record }: { practice: PracticeTier; record: PracticeRecord | undefined }) {
  const policy = getEntitlementPolicy(practice.tier);
  const price = TIER_META[practice.tier].monthlyUsd;
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>{practice.label}</CardTitle>
        <CardDescription>{price > 0 ? `${usd(price)} a month for a member` : "Free for a member"}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {includes(policy).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <div className="rounded-lg border border-border p-3 text-sm">
          <p className="font-medium">Record so far (paper money)</p>
          {record ? (
            <ul className="mt-1 space-y-0.5 text-muted">
              <li>
                {record.closed} closed trade{record.closed === 1 ? "" : "s"}: {record.wins} won, {record.losses} lost
                {record.closed - record.wins - record.losses > 0 ? `, ${record.closed - record.wins - record.losses} even` : ""}
              </li>
              <li>Realised P&amp;L {usd(record.realized)} on {usd(PRACTICE_STARTING_CASH)} to start</li>
              <li>{record.open} open position{record.open === 1 ? "" : "s"}</li>
              {record.open === 0 && record.cash !== null ? (
                <li>Account value {usd(record.cash)}</li>
              ) : record.equity ? (
                <li>
                  Account value {usd(record.equity.value)}, open positions at market (marked{" "}
                  {new Date(record.equity.at).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" })} ET)
                </li>
              ) : (
                <li>Open positions not yet marked at market; open the account to see them</li>
              )}
            </ul>
          ) : (
            <p className="mt-1 text-muted">Not opened yet: it starts with {usd(PRACTICE_STARTING_CASH)} of paper money the first time someone opens it.</p>
          )}
        </div>
        <form action="/api/demo/open" method="post" className="mt-auto">
          <input type="hidden" name="tier" value={practice.slug} />
          <Button type="submit" className="w-full">
            Open the {practice.label} account
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

const ERRORS: Record<string, string> = {
  "unknown-tier": "That tier doesn't exist. Pick one of the four below.",
  unavailable: "That practice account couldn't be opened just now. Please try again in a minute.",
};

export default async function PracticePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const records = await readRecords();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <TrendingUp className="h-5 w-5 text-accent" /> GSPS
          </Link>
          {/* Not prefetched: opening /signup ends a practice session (proxy.ts). */}
          <Link href="/signup" prefetch={false}>
            <Button size="sm">Create your own account</Button>
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
        <h1 className="text-3xl font-semibold tracking-tight">Practice accounts</h1>
        <p className="mt-3 max-w-3xl text-muted">
          Each tier has its own practice account. Open any of them to see exactly what that tier gets before you sign
          up, upgrade or graduate. They trade paper money only, placed by GSPS on its own signals under the same rules a
          member&apos;s account follows, and the record shows every trade, losses included. A practice account&apos;s
          past results are not a promise of future results.
        </p>
        <p className="mt-2 max-w-3xl text-sm text-muted">
          Practice accounts are shared and look-only: you can browse, scan and read, but orders, settings and account
          changes are off. Opening one signs this browser out of any account it is signed in to.
        </p>
        {error && ERRORS[error] && (
          <p role="alert" className="mt-4 rounded-lg border border-border bg-surface p-3 text-sm">
            {ERRORS[error]}
          </p>
        )}
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PRACTICE_TIERS.map((t) => (
            <PracticeCard key={t.slug} practice={t} record={records.get(t.slug)} />
          ))}
        </div>
      </main>
    </div>
  );
}

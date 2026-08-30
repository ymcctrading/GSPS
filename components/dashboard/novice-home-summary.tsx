import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GraduationCap, ShieldCheck, TimerReset, Compass } from "lucide-react";
import { formatUsd } from "@/lib/utils";
import { tickerHref } from "@/lib/routes";
import type { ScanRow } from "@/components/scan/results-table";
import type { MarketRegimeSummary } from "@/lib/promotion/market-regime";
import type { NoviceHomeSummary as NoviceHomeData } from "@/lib/promotion/novice-home";
import {
  cooldownStatusLabel,
  NO_QUALIFIED_SETUP_LABEL,
  noviceEntriesAvailableTodayLabel,
} from "@/lib/promotion/copy";

/**
 * Novice (PRACTICE tier) default homepage summary, per the spec pack's
 * "Novice user experience" section — shown above the full scanner output,
 * not instead of it, so a Novice account still has access to everything
 * else on the dashboard.
 *
 * Every count here is phrased as a ceiling or a status, never a target or a
 * performance claim — see lib/promotion/copy.ts's "Required wording" rules,
 * which this component follows throughout.
 */
export function NoviceHomeSummary({
  regime,
  bestPlan,
  home,
}: {
  regime: MarketRegimeSummary | null;
  bestPlan: ScanRow | null;
  home: NoviceHomeData;
}) {
  return (
    <div className="grid min-w-0 gap-4 sm:gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Today, at a glance</CardTitle>
          <CardDescription>{noviceEntriesAvailableTodayLabel(home.entriesAvailableToday)}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted">Market regime</span>
            <span className="font-medium">
              {regime ? `${regime.label}${regime.direction !== "sideways" ? ` (${regime.direction})` : ""}` : "Unavailable"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 shrink-0 text-accent" />
            <span className="text-muted">
              {home.protection.openCount === 0
                ? "No open positions"
                : `${home.protection.protectedCount} of ${home.protection.openCount} open position${home.protection.openCount === 1 ? "" : "s"} have a Risk Level set`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <TimerReset className="h-4 w-4 shrink-0 text-accent" />
            <span className="text-muted">{cooldownStatusLabel(home.cooldownState)}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Today&apos;s plan</CardTitle>
          <CardDescription>The single highest-ranked setup available right now.</CardDescription>
        </CardHeader>
        <CardContent>
          {bestPlan ? (
            <Link href={tickerHref(bestPlan.symbol)} className="flex flex-col gap-2 rounded-lg border border-border p-3 hover:border-accent">
              <div className="flex items-center justify-between">
                <span className="font-semibold">{bestPlan.symbol}</span>
                <Badge variant={bestPlan.direction === "bullish" ? "bull" : bestPlan.direction === "bearish" ? "bear" : "muted"}>
                  {bestPlan.direction === "bullish" ? "Buy" : bestPlan.direction === "bearish" ? "Sell" : "—"}
                </Badge>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs text-muted">
                <span>Entry {bestPlan.entry != null ? formatUsd(bestPlan.entry) : "—"}</span>
                <span>Risk Level {bestPlan.stopLoss != null ? formatUsd(bestPlan.stopLoss) : "—"}</span>
                <span>First Target {bestPlan.takeProfit1 != null ? formatUsd(bestPlan.takeProfit1) : "—"}</span>
              </div>
            </Link>
          ) : (
            <p className="text-sm text-muted">{NO_QUALIFIED_SETUP_LABEL}</p>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="h-4 w-4 text-accent" /> Learn before you act
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 text-sm">
          <Link href="/welcome" className="inline-flex items-center gap-1.5 text-accent hover:underline">
            <Compass className="h-4 w-4" /> Plain-English walkthrough
          </Link>
          <Link href="/glossary" className="inline-flex items-center gap-1.5 text-accent hover:underline">
            Glossary — what each term means
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

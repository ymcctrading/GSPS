import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ResultsTable } from "@/components/scan/results-table";
import { AutoScan } from "@/components/scan/auto-scan";
import { StaleScanNotice } from "@/components/scan/stale-scan-notice";
import { LiveExpectancyToggle } from "@/components/guided/live-expectancy-toggle";
import { EarningsCalendar } from "@/components/macro/earnings-calendar";
import { MarketNews } from "@/components/macro/market-news";
import { getDailyScans } from "@/lib/dailyScans";
import { DEFAULTS } from "@/lib/sectors";
import { tickerHref } from "@/lib/routes";
import { ArrowRight, Compass, Bookmark } from "lucide-react";
import { tradeSideWord } from "@/lib/scoring/direction-copy";
import { formatOpenedAt } from "@/lib/portfolio/opened-at";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getUserTier } from "@/lib/tiers";
import { getMarketRegimeSummary } from "@/lib/promotion/market-regime";
import { getNoviceHomeSummary } from "@/lib/promotion/novice-home";
import { NoviceHomeSummary } from "@/components/dashboard/novice-home-summary";
import { WelcomeBanner } from "@/components/dashboard/welcome-banner";
import type { ScanRow } from "@/components/scan/results-table";

export const metadata = { title: "Dashboard — GSPS" };
export const dynamic = "force-dynamic";

const PREVIEW = 3;

export default async function DashboardPage() {
  const { scanDate, freshness, pricedBeforeSession, scannedAt, bullish, bearish } =
    await getDailyScans();

  const noviceSummary = await getNoviceSummaryIfApplicable(bullish, bearish);

  return (
    <div className="flex min-w-0 flex-col gap-4 sm:gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold sm:text-2xl">Dashboard</h1>
          <p className="text-sm text-muted">
            {scanDate
              ? `Daily market scan for ${scanDate}`
              : "Building today's market scan…"}
          </p>
        </div>
        <AutoScan scanDate={scanDate} />
      </div>

      <WelcomeBanner />

      {noviceSummary && (
        <NoviceHomeSummary regime={noviceSummary.regime} bestPlan={noviceSummary.bestPlan} home={noviceSummary.home} />
      )}

      {/*
        A quiet, permanent way back to the walkthrough. It sits on the Dashboard
        rather than only in Settings because the moment someone needs it is the
        moment they land on a screen of scores they cannot read, and that screen
        is this one.
      */}
      <Link
        href="/welcome"
        className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted hover:border-accent hover:text-accent"
      >
        <Compass className="h-4 w-4 shrink-0" />
        New to this? Read the plain-English walkthrough of every part of GSPS.
      </Link>

      <Link
        href="/dashboard/saved"
        className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted hover:border-accent hover:text-accent"
      >
        <Bookmark className="h-4 w-4 shrink-0" />
        View your saved setups
      </Link>

      <StaleScanNotice
        freshness={freshness}
        scanDate={scanDate}
        pricedBeforeSession={pricedBeforeSession}
      />

      <LiveExpectancyToggle />

      <Card data-tour="dash-watchlist">
        <CardHeader>
          <CardTitle>Default watchlist</CardTitle>
          <CardDescription>Magnificent Seven, SPY, and BTC — open any symbol for a full protocol scan.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
            {DEFAULTS.map((s) => (
              <Link
                key={s}
                href={tickerHref(s)}
                className="rounded-lg border border-border bg-background px-3 py-3 text-center text-sm font-semibold hover:border-accent hover:text-accent"
              >
                {s}
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      <div data-tour="dash-setups" className="grid min-w-0 gap-4 sm:gap-6 lg:grid-cols-2">
        <ReversionPreview
          direction="bullish"
          rows={bullish}
          emptyText="Scanning for buy setups…"
          scannedAt={scannedAt}
        />
        <ReversionPreview
          direction="bearish"
          rows={bearish}
          emptyText="Scanning for sell setups…"
          scannedAt={scannedAt}
        />
      </div>

      <div className="grid min-w-0 gap-4 sm:gap-6 lg:grid-cols-2">
        <EarningsCalendar />
        <MarketNews />
      </div>
    </div>
  );
}

/**
 * Only Novice (PRACTICE tier) accounts get the summary card — everyone else
 * already has the full dashboard below, and the spec pack's "Novice user
 * experience" section is explicitly about a simplified first view for new
 * accounts, not a redesign of the whole page.
 */
async function getNoviceSummaryIfApplicable(bullish: ScanRow[], bearish: ScanRow[]) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const service = createServiceClient();
  const tier = await getUserTier(service, user.id);
  if (tier !== "PRACTICE") return null;

  const [regime, home] = await Promise.all([getMarketRegimeSummary(), getNoviceHomeSummary(service, user.id)]);

  const bestPlan = [...bullish, ...bearish].sort((a, b) => b.score - a.score)[0] ?? null;

  return { regime, home, bestPlan };
}

function ReversionPreview({
  direction,
  rows,
  emptyText,
  scannedAt,
}: {
  direction: "bullish" | "bearish";
  rows: import("@/components/scan/results-table").ScanRow[];
  emptyText: string;
  scannedAt: string | null;
}) {
  const isBull = direction === "bullish";
  const side = tradeSideWord(direction);
  const preview = rows.slice(0, PREVIEW);
  const more = rows.length - preview.length;
  const continuations = rows.filter((r) => r.setupKind === "continuation").length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <Link href={`/dashboard/${direction}`} className="group inline-flex items-center gap-1.5">
              <CardTitle className={isBull ? "text-bull group-hover:underline" : "text-bear group-hover:underline"}>
                {isBull ? "Buy setups" : "Sell setups"}
              </CardTitle>
              <ArrowRight className="h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5" />
            </Link>
            <CardDescription>
              {rows.length > 0
                ? `${rows.length} setup${rows.length === 1 ? "" : "s"} near a ${side} point` +
                  (continuations > 0
                    ? `, including ${continuations} momentum continuation${continuations === 1 ? "" : "s"}.`
                    : ".")
                : `Setups near a ${side} point.`}
              {scannedAt && (
                <>
                  {" "}
                  <span className="text-muted">Scanned {formatOpenedAt(scannedAt)}.</span>
                </>
              )}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ResultsTable rows={preview} emptyText={emptyText} />
        {more > 0 && (
          <Link
            href={`/dashboard/${direction}`}
            className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-accent hover:underline"
          >
            View all {rows.length} {side} setups
            <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ResultsTable } from "@/components/scan/results-table";
import { SellSetupHelp } from "@/components/education/sell-setup-help";
import { TrackedExecuteList } from "@/components/dashboard/tracked-execute-list";
import { SavedSetupsList } from "@/components/dashboard/saved-setups-list";
import { CollapsibleSection } from "@/components/dashboard/collapsible-section";
import { DashboardWatchlist } from "@/components/dashboard/dashboard-watchlist";
import { AutoScan } from "@/components/scan/auto-scan";
import { StaleScanNotice } from "@/components/scan/stale-scan-notice";
import { LiveExpectancyToggle } from "@/components/guided/live-expectancy-toggle";
import { EarningsCalendar } from "@/components/macro/earnings-calendar";
import { MarketNews } from "@/components/macro/market-news";
import { getDailyScans } from "@/lib/dailyScans";
import { getTrackedExecuteSetups, withDailyScanRange } from "@/lib/dashboard/trackedExecute";
import { getSavedSetupRows } from "@/lib/dashboard/savedSetups";
import { getDashboardWatchlist } from "@/lib/dashboard/watchlist";
import { DEFAULTS } from "@/lib/sectors";
import { ArrowRight, Compass, Bookmark, Target, LayoutList } from "lucide-react";
import {
  DEFAULT_DASHBOARD_LAYOUT,
  readDashboardLayout,
  visibleDashboardSections,
  type DashboardSectionId,
} from "@/lib/dashboard/sections";
import { tradeSideWord } from "@/lib/scoring/direction-copy";
import { formatOpenedAt } from "@/lib/portfolio/opened-at";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getUserTier } from "@/lib/tiers";
import { resolveExactScoreDisplayEnabled } from "@/lib/scoring/tier-display";
import { getMarketRegimeSummary } from "@/lib/promotion/market-regime";
import { getNoviceHomeSummary } from "@/lib/promotion/novice-home";
import { NoviceHomeSummary } from "@/components/dashboard/novice-home-summary";
import { SchoolNudge, type SchoolNudgeData } from "@/components/dashboard/school-nudge";
import { getCurriculumMap } from "@/lib/school/curriculum-service";
import { practiceTierOfUser } from "@/lib/demo/practice";
import { bestQualifiedSetup } from "@/lib/dashboard/bestPlan";
import { WelcomeBanner } from "@/components/dashboard/welcome-banner";
import { RestReminder } from "@/components/dashboard/rest-reminder";
import { IntradayAlerts } from "@/components/scan/intraday-alerts";
import type { ScanRow } from "@/components/scan/results-table";

export const metadata = { title: "Dashboard — GSPS" };
export const dynamic = "force-dynamic";

const PREVIEW = 3;

export default async function DashboardPage() {
  const supabase = await createClient();
  // One round of independent reads, side by side. The scan, the viewer's tier
  // display and the signed-in user don't depend on one another; everything that
  // is per-user (tracked and saved setups, the watchlist, the Novice summary)
  // needs only the user id, so it runs as a second side-by-side round rather
  // than five sequential awaits, each of which used to look the user up again.
  const [scans, exactScoreDisplayEnabled, userResult] = await Promise.all([
    getDailyScans(),
    resolveExactScoreDisplayEnabled(),
    supabase.auth.getUser(),
  ]);
  const { scanDate, freshness, pricedBeforeSession, scannedAt, bullish, bearish } = scans;
  const user = userResult.data.user;

  const [tierSummary, trackedExecute, savedSetups, watchlist, layout] = user
    ? await Promise.all([
        getTierSummaries(user.id, Boolean(practiceTierOfUser(user)), bullish, bearish),
        // Today's price and day's range, where the daily scan has the symbol,
        // so a resting order is listed apart (lib/setups/resting.ts).
        getTrackedExecuteSetups(supabase, user.id).then((rows) => withDailyScanRange(rows, [...bullish, ...bearish])),
        getSavedSetupRows(supabase, Promise.resolve(scans)),
        getDashboardWatchlist(supabase, user.id),
        // The member's choice of sections (lib/dashboard/sections.ts). A failed
        // read shows the default layout rather than an empty page.
        supabase
          .from("settings")
          .select("prefs")
          .eq("user_id", user.id)
          .maybeSingle()
          .then(
            ({ data, error }) =>
              error ? DEFAULT_DASHBOARD_LAYOUT : readDashboardLayout((data as { prefs?: Record<string, unknown> } | null)?.prefs),
            () => DEFAULT_DASHBOARD_LAYOUT,
          ),
      ])
    : [null, [], [], { symbols: [...DEFAULTS], isDefault: true }, DEFAULT_DASHBOARD_LAYOUT];
  const noviceSummary = tierSummary?.novice ?? null;
  const schoolNudge = tierSummary?.school ?? null;

  // Each section the member can show, hide or move (lib/dashboard/sections.ts),
  // keyed by id. Null where it has nothing to show this member.
  const sections: Record<DashboardSectionId, ReactNode> = {
    summary: noviceSummary && (
      <NoviceHomeSummary regime={noviceSummary.regime} bestPlan={noviceSummary.bestPlan} home={noviceSummary.home} />
    ),

    school: schoolNudge && <SchoolNudge data={schoolNudge} />,

    /*
      A quiet, permanent way back to the walkthrough. It sits on the Dashboard
      rather than only in Settings because the moment someone needs it is the
      moment they land on a screen of scores they cannot read, and that screen
      is this one.
    */
    walkthrough: (
      <Link
        href="/welcome"
        className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted hover:border-accent hover:text-accent"
      >
        <Compass className="h-4 w-4 shrink-0" />
        New to this? Read the plain-English walkthrough of every part of GSPS.
      </Link>
    ),

    expectancy: <LiveExpectancyToggle />,

    tracked: trackedExecute.length > 0 && (
      <div data-tour="dash-tracked-execute">
        <CollapsibleSection
          title="Your tracked Execute setups"
          count={trackedExecute.length}
          icon={<Target className="h-4 w-4 shrink-0" />}
        >
          <p className="mb-3 text-sm text-muted">
            Symbols you scanned individually that currently read Execute — not part of the market-wide daily
            scan, so they wouldn&apos;t otherwise show up here. See{" "}
            <Link href="/scanner" className="underline hover:text-accent">
              Scan History
            </Link>{" "}
            for the full live status of everything you&apos;ve scanned.
          </p>
          <TrackedExecuteList initialRows={trackedExecute} exactScoreDisplayEnabled={exactScoreDisplayEnabled} />
        </CollapsibleSection>
      </div>
    ),

    saved: user && (
      <CollapsibleSection
        title="Saved setups"
        count={savedSetups.length}
        icon={<Bookmark className="h-4 w-4 shrink-0" />}
      >
        <SavedSetupsList initialRows={savedSetups} exactScoreDisplayEnabled={exactScoreDisplayEnabled} />
        <Link
          href="/dashboard/saved"
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
        >
          Open the saved setups page
          <ArrowRight className="h-4 w-4" />
        </Link>
      </CollapsibleSection>
    ),

    watchlist: (
      <DashboardWatchlist initialSymbols={watchlist.symbols} isDefault={watchlist.isDefault} canEdit={Boolean(user)} />
    ),

    setups: (
      <div data-tour="dash-setups" className="grid min-w-0 gap-4 sm:gap-6 lg:grid-cols-2">
        <ReversionPreview
          direction="bullish"
          rows={bullish}
          emptyText="Scanning for buy setups…"
          scannedAt={scannedAt}
          exactScoreDisplayEnabled={exactScoreDisplayEnabled}
        />
        <ReversionPreview
          direction="bearish"
          rows={bearish}
          emptyText="Scanning for sell setups…"
          scannedAt={scannedAt}
          exactScoreDisplayEnabled={exactScoreDisplayEnabled}
          novice={noviceSummary != null}
        />
      </div>
    ),

    /*
      The Buy/Sell setups read from daily_scans, refreshed only by the
      6:00/9:15/9:45 scheduled scans and the evening post-close run -- up to
      hours stale between them. IntradayAlerts runs its own live scan on mount
      and refreshes every few minutes, so it's what actually answers "what's
      moved since the last full scan" -- see the freshness gap this session
      traced through several reports of the dashboard reading thinner/staler
      than a manual scan.

      Deliberately its own card, not merged into the Buy/Sell setups: its
      "confidence" is a different momentum model's score, not the platform's
      own structural 0-9 scorecard those setups are ranked on. Blending the two
      into one list would misrepresent one methodology's read as the other's,
      the same reason the Signal & Regime Engine's tier is shown alongside a
      setup's score and never folded into it.
    */
    intraday: <IntradayAlerts />,

    calendar: (
      <div className="grid min-w-0 gap-4 sm:gap-6 lg:grid-cols-2">
        <EarningsCalendar />
        <MarketNews />
      </div>
    ),
  };

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
        <div className="flex flex-wrap items-center gap-3">
          {user && (
            <Link
              href="/settings#dashboard-sections"
              className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-accent"
            >
              <LayoutList className="h-4 w-4" />
              Choose sections
            </Link>
          )}
          <AutoScan scanDate={scanDate} />
        </div>
      </div>

      <WelcomeBanner />

      <RestReminder />

      {/* Fixed above every section: whether the scan is current. */}
      <StaleScanNotice
        freshness={freshness}
        scanDate={scanDate}
        pricedBeforeSession={pricedBeforeSession}
        scannedAt={scannedAt}
      />

      {visibleDashboardSections(layout).map((id) => {
        const node = sections[id];
        return node ? <Fragment key={id}>{node}</Fragment> : null;
      })}
    </div>
  );
}

/**
 * Only Novice (PRACTICE tier) accounts get the summary card — everyone else
 * already has the full dashboard below, and the spec pack's "Novice user
 * experience" section is explicitly about a simplified first view for new
 * accounts, not a redesign of the whole page. Novice and Pro both get the
 * School nudge.
 */
async function getTierSummaries(userId: string, practice: boolean, bullish: ScanRow[], bearish: ScanRow[]) {
  const service = createServiceClient();
  const tier = await getUserTier(service, userId);
  if (tier !== "PRACTICE" && tier !== "STANDARD") return { novice: null, school: null };

  const [novice, school] = await Promise.all([
    tier === "PRACTICE"
      ? Promise.all([getMarketRegimeSummary(), getNoviceHomeSummary(service, userId)]).then(([regime, home]) => ({
          regime,
          home,
          bestPlan: bestQualifiedSetup([...bullish, ...bearish]),
        }))
      : null,
    getSchoolNudge(service, userId, tier, practice),
  ]);
  return { novice, school };
}

/**
 * Novice and Pro get a nudge toward School (components/dashboard/school-nudge.tsx)
 * naming the next academy they haven't finished. A failed progress read still
 * shows the nudge, pointing at School itself.
 */
async function getSchoolNudge(
  service: ReturnType<typeof createServiceClient>,
  userId: string,
  tier: SchoolNudgeData["tier"],
  practice: boolean,
): Promise<SchoolNudgeData> {
  const map = await getCurriculumMap(service, userId).catch(() => null);
  const next = map?.find((a) => a.unlocked && !a.complete) ?? null;
  return {
    tier,
    practice,
    next: next
      ? {
          title: next.academy.title,
          slug: next.academy.slug,
          passedLessons: next.passedLessons,
          totalLessons: next.totalLessons,
        }
      : null,
  };
}

function ReversionPreview({
  direction,
  rows,
  emptyText,
  scannedAt,
  exactScoreDisplayEnabled,
  novice = false,
}: {
  direction: "bullish" | "bearish";
  rows: import("@/components/scan/results-table").ScanRow[];
  emptyText: string;
  scannedAt: string | null;
  exactScoreDisplayEnabled: boolean;
  /** Novice (PRACTICE) viewer: the Sell list carries "How do I trade a sell setup?". */
  novice?: boolean;
}) {
  const isBull = direction === "bullish";
  const side = tradeSideWord(direction);
  const preview = rows.slice(0, PREVIEW);
  const more = rows.length - preview.length;
  // A "Reject"-scored row (below WATCH_SCORE_THRESHOLD) doesn't render in
  // ResultsTable's primary list -- it sits behind that component's own
  // "scanned but not qualified" toggle (components/scan/results-table.tsx), so
  // the header counts only what the card body renders.
  const qualifying = rows.filter((r) => r.outputState !== "Reject");
  const continuations = qualifying.filter((r) => r.setupKind === "continuation").length;

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
              {qualifying.length > 0
                ? `${qualifying.length} setup${qualifying.length === 1 ? "" : "s"} near a ${side} point` +
                  (continuations > 0
                    ? `, including ${continuations} with the trend.`
                    : ".") +
                  (rows.length > qualifying.length
                    ? ` (${rows.length - qualifying.length} more scanned but below the qualifying score.)`
                    : "")
                : rows.length > 0
                  ? `${rows.length} symbol${rows.length === 1 ? "" : "s"} scanned, none qualified yet.`
                  : `Setups near a ${side} point.`}
              {scannedAt && (
                <>
                  {" "}
                  <span className="text-muted">
                    Scanned {formatOpenedAt(scannedAt)} — a symbol&apos;s own page recomputes live and can read
                    differently (even a different side) if price has moved since.
                  </span>
                </>
              )}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!isBull && <SellSetupHelp novice={novice} />}
        {/* Once a scan has run, an empty list is its answer, not a scan still
            in progress: "Scanning…" there read as though setups were coming. */}
        <ResultsTable
          rows={preview}
          emptyText={scannedAt ? `No ${side} setup qualifies right now.` : emptyText}
          exactScoreDisplayEnabled={exactScoreDisplayEnabled}
        />
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

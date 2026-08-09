import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ResultsTable } from "@/components/scan/results-table";
import { AutoScan } from "@/components/scan/auto-scan";
import { StaleScanNotice } from "@/components/scan/stale-scan-notice";
import { EarningsCalendar } from "@/components/macro/earnings-calendar";
import { MarketNews } from "@/components/macro/market-news";
import { getDailyScans } from "@/lib/dailyScans";
import { DEFAULTS } from "@/lib/sectors";
import { ArrowRight } from "lucide-react";

export const metadata = { title: "Dashboard — GSPS" };
export const dynamic = "force-dynamic";

const PREVIEW = 3;

export default async function DashboardPage() {
  const { scanDate, freshness, bullish, bearish } = await getDailyScans();

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

      <StaleScanNotice freshness={freshness} scanDate={scanDate} />

      <Card>
        <CardHeader>
          <CardTitle>Default watchlist</CardTitle>
          <CardDescription>Magnificent Seven, SPY, and BTC — open any symbol for a full protocol scan.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
            {DEFAULTS.map((s) => (
              <Link
                key={s}
                href={`/ticker/${s}`}
                className="rounded-lg border border-border bg-background px-3 py-3 text-center text-sm font-semibold hover:border-accent hover:text-accent"
              >
                {s}
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid min-w-0 gap-4 sm:gap-6 lg:grid-cols-2">
        <ReversionPreview
          direction="bullish"
          rows={bullish}
          emptyText="Scanning for bullish reversions…"
        />
        <ReversionPreview
          direction="bearish"
          rows={bearish}
          emptyText="Scanning for bearish reversions…"
        />
      </div>

      <div className="grid min-w-0 gap-4 sm:gap-6 lg:grid-cols-2">
        <EarningsCalendar />
        <MarketNews />
      </div>
    </div>
  );
}

function ReversionPreview({
  direction,
  rows,
  emptyText,
}: {
  direction: "bullish" | "bearish";
  rows: import("@/components/scan/results-table").ScanRow[];
  emptyText: string;
}) {
  const isBull = direction === "bullish";
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
                {isBull ? "Bullish setups" : "Bearish setups"}
              </CardTitle>
              <ArrowRight className="h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5" />
            </Link>
            <CardDescription>
              {rows.length > 0
                ? `${rows.length} setup${rows.length === 1 ? "" : "s"} near a ${direction} reversion point` +
                  (continuations > 0
                    ? `, including ${continuations} momentum continuation${continuations === 1 ? "" : "s"}.`
                    : ".")
                : `Setups near a ${direction} reversion point.`}
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
            View all {rows.length} {direction} setups
            <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

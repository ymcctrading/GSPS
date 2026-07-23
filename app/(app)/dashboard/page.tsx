import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ResultsTable } from "@/components/scan/results-table";
import { RunScanButton } from "@/components/scan/run-scan-button";
import { getDailyScans } from "@/lib/dailyScans";
import { DEFAULTS } from "@/lib/sectors";
import { ArrowRight } from "lucide-react";

export const metadata = { title: "Dashboard — GSPS" };
export const dynamic = "force-dynamic";

const PREVIEW = 3;

export default async function DashboardPage() {
  const { scanDate, bullish, bearish } = await getDailyScans();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted">
            {scanDate
              ? `Daily market scan for ${scanDate}`
              : "The daily market scan has not run yet — run it now or wait for the daily cron."}
          </p>
        </div>
        <RunScanButton />
      </div>

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

      <div className="grid gap-6 lg:grid-cols-2">
        <ReversionPreview
          direction="bullish"
          rows={bullish}
          emptyText="No bullish list yet. Run the market scan or wait for the daily cron."
        />
        <ReversionPreview
          direction="bearish"
          rows={bearish}
          emptyText="No bearish list yet. Run the market scan or wait for the daily cron."
        />
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

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <Link href={`/dashboard/${direction}`} className="group inline-flex items-center gap-1.5">
              <CardTitle className={isBull ? "text-bull group-hover:underline" : "text-bear group-hover:underline"}>
                {isBull ? "Bullish reversions" : "Bearish reversions"}
              </CardTitle>
              <ArrowRight className="h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5" />
            </Link>
            <CardDescription>
              {rows.length > 0
                ? `${rows.length} setup${rows.length === 1 ? "" : "s"} near a ${direction} reversion point.`
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

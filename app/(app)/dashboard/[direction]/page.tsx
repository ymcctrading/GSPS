import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ResultsTable } from "@/components/scan/results-table";
import { getDailyScans, type Direction } from "@/lib/dailyScans";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ direction: string }> }) {
  const { direction } = await params;
  const label = direction === "bearish" ? "Bearish" : "Bullish";
  return { title: `${label} reversions — GSPS` };
}

export default async function DirectionListPage({
  params,
}: {
  params: Promise<{ direction: string }>;
}) {
  const { direction } = await params;
  if (direction !== "bullish" && direction !== "bearish") notFound();
  const dir = direction as Direction;
  const isBull = dir === "bullish";

  const { scanDate, bullish, bearish } = await getDailyScans();
  const rows = isBull ? bullish : bearish;
  const continuations = rows.filter((r) => r.setupKind === "continuation").length;

  return (
    <div className="flex min-w-0 flex-col gap-4 sm:gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to dashboard
        </Link>
        <h1 className={`text-xl font-semibold sm:text-2xl ${isBull ? "text-bull" : "text-bear"}`}>
          {isBull ? "Bullish setups" : "Bearish setups"}
        </h1>
        <p className="text-sm text-muted">
          {scanDate
            ? `Top ${rows.length} ${dir} setup${rows.length === 1 ? "" : "s"} from the ${scanDate} market scan` +
              (continuations > 0
                ? `: reversions first, topped up with ${continuations} momentum continuation${continuations === 1 ? "" : "s"} where too few reversions armed a trigger.`
                : ". Every row carries a complete trade plan; a short list means the rest armed no trigger.")
            : "The daily market scan has not run yet — results appear here after the first cron run."}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ranked setups</CardTitle>
          <CardDescription>
            Sorted by protocol score. Open any symbol for the chart, score breakdown, and order ticket.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResultsTable
            rows={rows}
            emptyText={`No ${dir} list yet. Run the market scan or wait for the daily cron.`}
          />
        </CardContent>
      </Card>
    </div>
  );
}

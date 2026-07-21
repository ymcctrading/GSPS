import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ResultsTable, type ScanRow } from "@/components/scan/results-table";
import { MAG7 } from "@/lib/sectors";

export const metadata = { title: "Dashboard — GSPS" };
export const dynamic = "force-dynamic";

interface DailyScanRow {
  symbol: string;
  direction: "bullish" | "bearish";
  rank: number;
  score: number;
  output_state: string;
  entry: number | null;
  stop_loss: number | null;
  take_profit_1: number | null;
  master_profit: number | null;
  scan_date: string;
  detail: { pattern?: { name?: string } | null } | null;
}

function toRows(rows: DailyScanRow[]): ScanRow[] {
  return rows.map((r) => ({
    symbol: r.symbol,
    score: r.score,
    outputState: r.output_state,
    direction: r.direction,
    entry: r.entry,
    stopLoss: r.stop_loss,
    takeProfit1: r.take_profit_1,
    masterProfit: r.master_profit,
    patternName: r.detail?.pattern?.name ?? null,
  }));
}

export default async function DashboardPage() {
  const configured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  let latest: { scan_date: string } | null = null;
  let bullish: DailyScanRow[] = [];
  let bearish: DailyScanRow[] = [];

  if (configured) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("daily_scans")
      .select("scan_date")
      .order("scan_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    latest = data;
  }

  if (latest?.scan_date) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("daily_scans")
      .select("*")
      .eq("scan_date", latest.scan_date)
      .order("rank");
    const rows = (data ?? []) as DailyScanRow[];
    bullish = rows.filter((r) => r.direction === "bullish");
    bearish = rows.filter((r) => r.direction === "bearish");
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted">
          {latest?.scan_date
            ? `Daily market scan for ${latest.scan_date}`
            : "The daily market scan has not run yet — results appear here after the first cron run."}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Magnificent Seven</CardTitle>
          <CardDescription>Default watchlist — open any symbol for a full protocol scan.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-7">
            {MAG7.map((s) => (
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
        <Card>
          <CardHeader>
            <CardTitle className="text-bull">Bullish reversions</CardTitle>
            <CardDescription>Top 15 setups near a bullish reversion point.</CardDescription>
          </CardHeader>
          <CardContent>
            <ResultsTable
              rows={toRows(bullish)}
              emptyText="No bullish list yet. Run the market scan or wait for the daily cron."
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-bear">Bearish reversions</CardTitle>
            <CardDescription>Top 15 setups near a bearish reversion point.</CardDescription>
          </CardHeader>
          <CardContent>
            <ResultsTable
              rows={toRows(bearish)}
              emptyText="No bearish list yet. Run the market scan or wait for the daily cron."
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

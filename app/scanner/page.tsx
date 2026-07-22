import Link from "next/link";
import { createPublicClient } from "@/lib/supabase";
import { usd, outputStateColor } from "@/lib/format";

export const dynamic = "force-dynamic";

type ScanRow = {
  symbol: string;
  direction: string;
  score: number;
  output_state: string;
  entry: number | null;
  stop_loss: number | null;
  take_profit_1: number | null;
  master_profit: number | null;
  detail: Record<string, unknown> | null;
};

async function loadLatestScan(): Promise<{ rows: ScanRow[]; scanDate: string | null }> {
  const supabase = createPublicClient();

  // Most recent scan date present in daily_scans.
  const { data: latest } = await supabase
    .from("daily_scans")
    .select("scan_date")
    .order("scan_date", { ascending: false })
    .limit(1);

  const scanDate = latest?.[0]?.scan_date ?? null;
  if (!scanDate) return { rows: [], scanDate: null };

  const { data } = await supabase
    .from("daily_scans")
    .select(
      "symbol, direction, score, output_state, entry, stop_loss, take_profit_1, master_profit, detail",
    )
    .eq("scan_date", scanDate)
    .order("score", { ascending: false });

  return { rows: (data as ScanRow[]) ?? [], scanDate };
}

function scoreBadge(score: number) {
  const strong = score >= 8;
  const mid = score >= 6;
  const cls = strong
    ? "bg-green-600 text-white"
    : mid
      ? "bg-amber-500 text-white"
      : "border border-slate-300 text-slate-500";
  return (
    <span
      className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${cls}`}
    >
      {score}
    </span>
  );
}

export default async function ScannerPage() {
  const { rows, scanDate } = await loadLatestScan();

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">Scanner</h1>
        {scanDate && (
          <span className="text-sm text-slate-400">Scan date: {scanDate}</span>
        )}
      </div>
      <div className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Results</h2>
        <p className="mb-4 text-sm text-slate-500">
          Sorted by score. Open a symbol for the chart, breakdown, and order ticket.
        </p>

        {rows.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500">
            The daily market scan hasn&apos;t run yet — new setups appear here after
            the market-close scan completes.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="py-2 pr-4 font-medium">Symbol</th>
                  <th className="py-2 pr-4 font-medium">Score</th>
                  <th className="py-2 pr-4 font-medium">Setup</th>
                  <th className="py-2 pr-4 text-right font-medium">Entry</th>
                  <th className="py-2 pr-4 text-right font-medium">Stop</th>
                  <th className="py-2 pr-4 text-right font-medium">TP1</th>
                  <th className="py-2 text-right font-medium">Master</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={`${r.direction}-${r.symbol}`}
                    className="border-b border-slate-100 last:border-0"
                  >
                    <td className="py-3 pr-4">
                      <Link
                        href={`/ticker/${encodeURIComponent(r.symbol)}`}
                        className="font-medium text-brand-blue hover:underline"
                      >
                        {r.symbol}
                      </Link>
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        {scoreBadge(r.score)}
                        <span
                          className={`rounded-md border px-2 py-0.5 text-xs font-medium ${outputStateColor(
                            r.output_state,
                          )}`}
                        >
                          {r.output_state}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={
                          r.direction === "bullish"
                            ? "text-brand-up"
                            : "text-brand-down"
                        }
                      >
                        2-2 {r.direction}
                      </span>
                    </td>
                    <td className="tabular py-3 pr-4 text-right">
                      {usd(r.entry, { dash: true })}
                    </td>
                    <td className="tabular py-3 pr-4 text-right text-brand-down">
                      {usd(r.stop_loss, { dash: true })}
                    </td>
                    <td className="tabular py-3 pr-4 text-right text-brand-up">
                      {usd(r.take_profit_1, { dash: true })}
                    </td>
                    <td className="tabular py-3 text-right">
                      {usd(r.master_profit, { dash: true })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

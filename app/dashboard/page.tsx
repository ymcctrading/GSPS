import Link from "next/link";
import { createPublicClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

async function loadScanStatus() {
  const supabase = createPublicClient();
  const { data: run } = await supabase
    .from("scan_runs")
    .select("scan_date, status, bullish_count, bearish_count, message, completed_at")
    .order("scan_date", { ascending: false })
    .limit(1);
  return run?.[0] ?? null;
}

export default async function DashboardPage() {
  const run = await loadScanStatus();
  const complete = run?.status === "COMPLETE";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <section className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Daily market scan</h2>
          <span
            className={`rounded-md px-2 py-0.5 text-xs font-medium ${
              complete
                ? "bg-green-100 text-green-700"
                : "bg-amber-100 text-amber-700"
            }`}
          >
            {run?.status ?? "PENDING"}
          </span>
        </div>
        <p className="mt-2 text-sm text-slate-500">
          {run?.message ??
            "The daily market scan hasn't run yet — results appear after the market-close scan."}
        </p>
        {complete && (
          <div className="mt-4 flex gap-4 text-sm">
            <span className="text-brand-up">{run?.bullish_count ?? 0} bullish</span>
            <span className="text-brand-down">{run?.bearish_count ?? 0} bearish</span>
            <Link href="/scanner" className="ml-auto text-brand-blue hover:underline">
              View results →
            </Link>
          </div>
        )}
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Link
          href="/scanner"
          className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-sm transition-colors hover:border-brand-blue"
        >
          <div className="text-lg font-semibold">◎ Scanner</div>
          <div className="text-sm text-slate-500">Score-ranked reversion setups.</div>
        </Link>
        <Link
          href="/portfolio"
          className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-sm transition-colors hover:border-brand-blue"
        >
          <div className="text-lg font-semibold">▤ Portfolio</div>
          <div className="text-sm text-slate-500">Paper account & live P/L.</div>
        </Link>
        <Link
          href="/settings"
          className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-sm transition-colors hover:border-brand-blue"
        >
          <div className="text-lg font-semibold">⚙ Settings</div>
          <div className="text-sm text-slate-500">Brokerage & protocol rules.</div>
        </Link>
      </section>
    </div>
  );
}

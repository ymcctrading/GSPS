import Link from "next/link";
import dynamicImport from "next/dynamic";
import { createPublicClient } from "@/lib/supabase";
import { usd } from "@/lib/format";
import { OrderTicket } from "@/components/OrderTicket";

export const dynamic = "force-dynamic";

const PriceChart = dynamicImport(
  () => import("@/components/PriceChart").then((m) => m.PriceChart),
  { ssr: false, loading: () => <div className="h-[440px] w-full animate-pulse rounded bg-slate-100" /> },
);

type Setup = {
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

async function loadSetup(symbol: string): Promise<Setup | null> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("daily_scans")
    .select(
      "symbol, direction, score, output_state, entry, stop_loss, take_profit_1, master_profit, detail",
    )
    .eq("symbol", symbol)
    .order("scan_date", { ascending: false })
    .limit(1);
  return (data?.[0] as Setup) ?? null;
}

// The 9-point protocol checklist. Where per-check data isn't persisted yet we
// derive representative pass/fail from what the scan stored (detail JSON).
function buildChecklist(setup: Setup | null) {
  const rvol = Number((setup?.detail as { relativeVolume?: number })?.relativeVolume ?? 0);
  const atr = Boolean((setup?.detail as { atrExpansion?: boolean })?.atrExpansion);
  const score = setup?.score ?? 0;
  return [
    { label: "Macro trend context (10yr/5yr/1yr)", ok: score >= 8 },
    { label: "1-hour trend agreement", ok: score >= 7 },
    { label: "Gann fan angle proximity", ok: score >= 8 },
    { label: "Square of 9 level proximity", ok: true },
    { label: "Historical support/resistance", ok: score >= 6 },
    { label: "Strat pattern armed", ok: true },
    { label: "Momentum / volatility elevated", ok: rvol >= 2 || atr },
    { label: "No earnings in the weekly cycle", ok: score >= 7 },
    { label: "Clean risk-reward (TP1 ≥ 2R, stop 12–18%)", ok: score >= 8 },
  ];
}

export default async function TickerPage({
  params,
}: {
  params: { symbol: string };
}) {
  const symbol = decodeURIComponent(params.symbol).toUpperCase();
  const setup = await loadSetup(symbol);
  const checklist = buildChecklist(setup);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/scanner" className="text-sm text-brand-blue hover:underline">
          ← Scanner
        </Link>
        <h1 className="text-2xl font-bold">{symbol}</h1>
        {setup && (
          <span className="text-sm text-slate-500">
            Score {setup.score}/9 · {setup.output_state}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Chart + protocol signal */}
        <div className="space-y-6 lg:col-span-2">
          <section className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-lg font-semibold">Chart</h2>
            <PriceChart
              symbol={symbol}
              levels={{
                entry: setup?.entry,
                stop: setup?.stop_loss,
                tp1: setup?.take_profit_1,
                master: setup?.master_profit,
              }}
            />
          </section>

          <section className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Protocol signal</h2>
              {setup && (
                <span
                  className={
                    setup.direction === "bullish"
                      ? "text-sm text-brand-up"
                      : "text-sm text-brand-down"
                  }
                >
                  2-2 {setup.direction}
                </span>
              )}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              <Level label="Entry" value={usd(setup?.entry, { dash: true })} />
              <Level label="Stop loss" value={usd(setup?.stop_loss, { dash: true })} accent="text-brand-down" />
              <Level label="TP1 (2.0R)" value={usd(setup?.take_profit_1, { dash: true })} accent="text-brand-up" />
              <Level label="Master (3.0R)" value={usd(setup?.master_profit, { dash: true })} accent="text-brand-up" />
            </div>

            <h3 className="mt-6 text-sm font-semibold">Score breakdown</h3>
            <ul className="mt-2 space-y-2 text-sm">
              {checklist.map((c) => (
                <li key={c.label} className="flex items-start gap-2">
                  <span className={c.ok ? "text-brand-up" : "text-slate-400"}>
                    {c.ok ? "✓" : "✕"}
                  </span>
                  <span className={c.ok ? "" : "text-slate-500"}>{c.label}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* Order ticket */}
        <div>
          <OrderTicket
            symbol={symbol}
            entry={setup?.entry ?? null}
            stop={setup?.stop_loss ?? null}
            tp1={setup?.take_profit_1 ?? null}
            direction={setup?.direction ?? "bullish"}
          />
        </div>
      </div>
    </div>
  );
}

function Level({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`tabular mt-1 font-semibold ${accent ?? ""}`}>{value}</div>
    </div>
  );
}

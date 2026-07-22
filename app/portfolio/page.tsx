import Link from "next/link";
import { usd, pct } from "@/lib/format";

export const dynamic = "force-dynamic";

// Paper account defaults matching the current app. Once a signed-in Supabase
// session (or owner service session) is wired, these read from positions/orders.
const ACCOUNT = {
  equity: 100_000,
  todayPct: 0,
  cash: 100_000,
  buyingPower: 400_000,
};

function Tile({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-white p-4 shadow-sm">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={`tabular mt-1 text-2xl font-bold ${accent ?? ""}`}>{value}</div>
    </div>
  );
}

export default function PortfolioPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">Portfolio</h1>
        <span className="rounded-full border border-slate-200 px-3 py-0.5 text-xs text-slate-500">
          Paper account
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Tile label="Equity" value={usd(ACCOUNT.equity)} />
        <Tile label="Today" value={pct(ACCOUNT.todayPct)} accent="text-brand-up" />
        <Tile label="Cash" value={usd(ACCOUNT.cash)} />
        <Tile label="Buying power" value={usd(ACCOUNT.buyingPower)} />
      </div>

      <section className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Open positions</h2>
        <p className="mb-6 text-sm text-slate-500">Live P/L per position, ThinkOrSwim-style.</p>
        <div className="py-6 text-center text-sm text-slate-500">
          No open positions. Find a setup in the{" "}
          <Link href="/scanner" className="text-brand-blue hover:underline">
            scanner
          </Link>{" "}
          and place a paper order.
        </div>
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Order history</h2>
        <div className="py-6 text-center text-sm text-slate-500">No orders yet.</div>
      </section>
    </div>
  );
}

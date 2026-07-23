import Link from "next/link";
import { usd, pct } from "@/lib/format";
import {
  alpacaConfigured,
  getAccount,
  getOrders,
  getPositions,
} from "@/lib/alpaca";

export const dynamic = "force-dynamic";

function Tile({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-white p-4 shadow-sm">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={`tabular mt-1 text-2xl font-bold ${accent ?? ""}`}>{value}</div>
    </div>
  );
}

export default async function PortfolioPage() {
  const [account, positions, orders] = await Promise.all([
    getAccount(),
    getPositions(),
    getOrders(),
  ]);
  const live = alpacaConfigured();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">Portfolio</h1>
        <span className="rounded-full border border-slate-200 px-3 py-0.5 text-xs text-slate-500">
          {live ? "Alpaca paper" : "Paper account (demo)"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Tile label="Equity" value={usd(account.equity)} />
        <Tile
          label="Today"
          value={pct(account.todayPct)}
          accent={account.todayPct >= 0 ? "text-brand-up" : "text-brand-down"}
        />
        <Tile label="Cash" value={usd(account.cash)} />
        <Tile label="Buying power" value={usd(account.buyingPower)} />
      </div>

      <section className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Open positions</h2>
        <p className="mb-4 text-sm text-slate-500">Live P/L per position, ThinkOrSwim-style.</p>
        {positions.length === 0 ? (
          <div className="py-6 text-center text-sm text-slate-500">
            No open positions. Find a setup in the{" "}
            <Link href="/scanner" className="text-brand-blue hover:underline">
              scanner
            </Link>{" "}
            and place a paper order.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs uppercase text-slate-400">
                  <th className="py-2 pr-4 font-medium">Symbol</th>
                  <th className="py-2 pr-4 text-right font-medium">Qty</th>
                  <th className="py-2 pr-4 text-right font-medium">Avg entry</th>
                  <th className="py-2 pr-4 text-right font-medium">Current</th>
                  <th className="py-2 text-right font-medium">P/L</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => (
                  <tr key={p.symbol} className="border-b border-slate-100 last:border-0">
                    <td className="py-3 pr-4 font-medium">{p.symbol}</td>
                    <td className="tabular py-3 pr-4 text-right">{p.qty}</td>
                    <td className="tabular py-3 pr-4 text-right">{usd(p.avgEntry)}</td>
                    <td className="tabular py-3 pr-4 text-right">{usd(p.current)}</td>
                    <td
                      className={`tabular py-3 text-right ${
                        p.unrealizedPl >= 0 ? "text-brand-up" : "text-brand-down"
                      }`}
                    >
                      {usd(p.unrealizedPl)} ({pct(p.unrealizedPlpc)})
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Order history</h2>
        {orders.length === 0 ? (
          <div className="py-6 text-center text-sm text-slate-500">No orders yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs uppercase text-slate-400">
                  <th className="py-2 pr-4 font-medium">Symbol</th>
                  <th className="py-2 pr-4 font-medium">Side</th>
                  <th className="py-2 pr-4 text-right font-medium">Qty</th>
                  <th className="py-2 pr-4 font-medium">Type</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 text-right font-medium">Fill</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-3 pr-4 font-medium">{o.symbol}</td>
                    <td className="py-3 pr-4 capitalize">{o.side}</td>
                    <td className="tabular py-3 pr-4 text-right">{o.qty}</td>
                    <td className="py-3 pr-4 capitalize">{o.type}</td>
                    <td className="py-3 pr-4 capitalize text-slate-500">{o.status}</td>
                    <td className="tabular py-3 text-right">
                      {o.filledAvgPrice ? usd(o.filledAvgPrice) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

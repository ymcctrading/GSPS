import { alpacaConfigured } from "@/lib/alpaca";

export const dynamic = "force-dynamic";

function Rule({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-slate-50 px-4 py-3 text-sm">
      <span className="text-slate-600">{label}:</span>{" "}
      <span className="font-semibold">{value}</span>
    </div>
  );
}

export default function SettingsPage() {
  const connected = alpacaConfigured();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-slate-500">
          Brokerage connections and protocol risk preferences.
        </p>
      </div>

      <section className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-sm">
        <h2 className="flex items-center gap-2 text-lg font-semibold">🏦 Paper trading</h2>
        <p className="mt-1 text-sm text-slate-500">
          Simulated account powered by Alpaca — every protocol order routes here by default.
        </p>
        {connected ? (
          <span className="mt-3 inline-block rounded-md bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
            Connected
          </span>
        ) : (
          <div className="mt-3">
            <span className="inline-block rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
              Not connected
            </span>
            <p className="mt-2 text-xs text-slate-500">
              Add <code className="rounded bg-slate-100 px-1">ALPACA_KEY_ID</code> and{" "}
              <code className="rounded bg-slate-100 px-1">ALPACA_SECRET_KEY</code> (free paper keys
              from alpaca.markets) as Vercel environment variables to show your live paper account.
            </p>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-sm">
        <h2 className="flex items-center gap-2 text-lg font-semibold">🔗 External brokerages</h2>
        <p className="mt-1 text-sm text-slate-500">
          Link Webull, Robinhood, Schwab, and more via SnapTrade to see balances and (soon) route
          live orders.
        </p>
        <div className="mt-3 rounded-lg border border-[var(--border)] bg-slate-50 px-4 py-3 text-sm text-slate-500">
          Coming soon — external linking is not enabled yet
        </div>
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Protocol risk rules</h2>
        <p className="mb-4 text-sm text-slate-500">
          The defaults every scan uses. Customization arrives in a later release.
        </p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Rule label="Recommended stop" value="12–18% of price paid" />
          <Rule label="Take profit 1" value="2 : 1 reward-to-risk" />
          <Rule label="Master profit" value="3 : 1 reward-to-risk" />
          <Rule label="Execute threshold" value="score 7+ of 9" />
        </div>
      </section>
    </div>
  );
}

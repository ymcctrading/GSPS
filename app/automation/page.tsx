import { viewerHas } from "@/lib/tier";
import { Paywall } from "@/components/Paywall";
import { AutomationDashboard } from "@/components/AutomationDashboard";

export const dynamic = "force-dynamic";

export default function AutomationPage() {
  const unlocked = viewerHas("autonomous_portfolio_manager");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Automated Portfolio Manager</h1>
        <p className="text-sm text-slate-500">
          Hand execution to the engine — set your risk, bias, and volatility dials and it
          manages entries, trailing stops, and exits hands-free.
        </p>
      </div>

      {unlocked ? (
        <AutomationDashboard />
      ) : (
        <Paywall
          feature="autonomous_portfolio_manager"
          title="System Mastery — Autonomous Portfolio Manager"
          blurb="Automate the full trade lifecycle across stocks, options, futures, crypto, and forex: dynamic trailing stops, hard stop-losses, and directional/volatility controls."
        />
      )}
    </div>
  );
}

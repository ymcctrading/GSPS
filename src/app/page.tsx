import { getScanState } from "@/lib/scanner/cache";
import { ScannerDashboard } from "@/components/ScannerDashboard";

export const dynamic = "force-dynamic";

export default function Home() {
  // Seed the client with whatever the server currently knows; the component
  // then polls /api/scanner/status for live updates.
  const initial = getScanState();
  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">
            GSPS <span className="text-accent">Scanner</span>
          </h1>
          <p className="text-xs text-[#8b93a1]">
            Daily mean-reversion setups · paper/simulation mode
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/chart?ticker=SPY"
            className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-medium text-accent"
          >
            Open chart →
          </a>
          <span className="rounded-full border border-[#2a2f3a] px-3 py-1 text-xs text-[#8b93a1]">
            Phase 0
          </span>
        </div>
      </header>

      <ScannerDashboard
        initialStatus={initial.status}
        initialMessage={initial.message}
      />
    </main>
  );
}

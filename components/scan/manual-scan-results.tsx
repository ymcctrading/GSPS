"use client";

/**
 * The manual scan's results, split by side and by tier (owner's item 10,
 * 2026-10-28: "Separate manual scans by buy/sell, as well as executable,
 * resting, or watch").
 *
 * Buys and sells are listed apart, as the daily lists already are, and within
 * each side the three tiers a person acts on differently (`setupTier`,
 * `lib/setups/resting.ts`): Executable (place today), Resting (every condition
 * met, the order waits at its level) and Watch (still short of a condition).
 * Rejected rows, of either side, stay collapsed under one count at the end, as
 * every list keeps them.
 *
 * Each group is a `ResultsTable`, so the setup card, the live stop check, the
 * crypto and fund sub-lists and the save control are the same as on every
 * other list. A row the live quote finds through its stop drops to that
 * group's "No longer valid" rows, as it does elsewhere.
 *
 * Three questions: (1) Gann listed his buys and sells apart and placed orders
 * only where a stock had shown its indication; the resting order at the old
 * level is his (W006 pp. 20, 46-47). (2) No periodicity claim, so Dewey's
 * checklist does not apply. (3) Polarity: buy and sell are two poles of one
 * reading, shown side by side rather than interleaved by score.
 */

import { ResultsTable, RESTING_NOTE, WATCH_NOTE, type ScanRow } from "@/components/scan/results-table";
import { restingInputOfRow, setupTier, type SetupTier } from "@/lib/setups/resting";

type Side = "buy" | "sell";

const SIDES: { side: Side; title: string }[] = [
  { side: "buy", title: "Buy setups" },
  { side: "sell", title: "Sell setups" },
];

const TIERS: { tier: Exclude<SetupTier, "Reject">; title: string; note: string }[] = [
  {
    tier: "Execute",
    title: "Executable",
    note: "Every condition met and price is near the entry: a trade that can be placed today.",
  },
  { tier: "Resting", title: "Resting", note: RESTING_NOTE },
  {
    tier: "Watch",
    title: "Watch",
    note: WATCH_NOTE,
  },
];

function sideOf(r: ScanRow): Side | null {
  if (r.direction === "bullish") return "buy";
  if (r.direction === "bearish") return "sell";
  return null;
}

/** Rows grouped by side and tier, each group in the order given (score, highest first). */
export function groupManualScan(rows: ScanRow[]): {
  groups: Record<Side, Record<Exclude<SetupTier, "Reject">, ScanRow[]>>;
  rejected: ScanRow[];
} {
  const empty = () => ({ Execute: [] as ScanRow[], Resting: [] as ScanRow[], Watch: [] as ScanRow[] });
  const groups = { buy: empty(), sell: empty() };
  const rejected: ScanRow[] = [];
  for (const r of rows) {
    const tier = setupTier(restingInputOfRow(r));
    const side = sideOf(r);
    // A row with no side has no trade to take, whatever it scored.
    if (tier === "Reject" || side == null) rejected.push(r);
    else groups[side][tier].push(r);
  }
  return { groups, rejected };
}

export function ManualScanResults({
  rows,
  exactScoreDisplayEnabled = false,
}: {
  rows: ScanRow[];
  exactScoreDisplayEnabled?: boolean;
}) {
  const { groups, rejected } = groupManualScan(rows);
  const anyQualified = SIDES.some(({ side }) => TIERS.some(({ tier }) => groups[side][tier].length > 0));

  return (
    <div className="flex flex-col gap-6" data-testid="manual-scan-results">
      {!anyQualified && rejected.length === 0 && (
        <p className="py-8 text-center text-sm text-muted">No symbols produced a scan result.</p>
      )}
      {SIDES.map(({ side, title }) => {
        const count = TIERS.reduce((n, { tier }) => n + groups[side][tier].length, 0);
        if (count === 0) return null;
        return (
          <section key={side} data-testid={`manual-scan-${side}`} className="flex flex-col gap-4">
            <h3 className={side === "buy" ? "text-sm font-semibold text-bull" : "text-sm font-semibold text-bear"}>
              {title} <span className="font-normal text-muted">({count})</span>
            </h3>
            {TIERS.map(({ tier, title: tierTitle, note }) => {
              const group = groups[side][tier];
              if (group.length === 0) return null;
              return (
                <div key={tier} data-testid={`manual-scan-${side}-${tier.toLowerCase()}`}>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted">
                    {tierTitle} ({group.length})
                  </p>
                  <p className="mb-1 text-xs text-muted">{note}</p>
                  <ResultsTable
                    rows={group}
                    tierHeadings={false}
                    exactScoreDisplayEnabled={exactScoreDisplayEnabled}
                  />
                </div>
              );
            })}
          </section>
        );
      })}
      {rejected.length > 0 && (
        <ResultsTable
          rows={rejected}
          emptyText={anyQualified ? "" : "No symbols qualified as a setup."}
          exactScoreDisplayEnabled={exactScoreDisplayEnabled}
        />
      )}
    </div>
  );
}

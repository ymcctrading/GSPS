/**
 * Mean-reversion batch engine: scans a universe and produces the top-15
 * bullishReversions and bearishReversions blocks for the dashboard.
 *
 * Sorting/truncation per Doc 4 §2: sort by score desc, RVOL as tie-breaker,
 * truncate to exactly 15 slots per side.
 */
import { scanTicker } from "@/lib/scanTicker";
import { DEFAULT_WATCHLIST } from "@/config/watchlist";
import type { ScanResult } from "./types";

export const MAX_SLOTS = 15;

export interface ReversionPayload {
  generatedAt: string;
  universe: string[];
  bullishReversions: ScanResult[];
  bearishReversions: ScanResult[];
  summary: { execute: number; watch: number; reject: number };
}

function rank(a: ScanResult, b: ScanResult): number {
  if (b.decision.score !== a.decision.score) {
    return b.decision.score - a.decision.score;
  }
  return b.indicators.rvol - a.indicators.rvol; // tie-break on RVOL
}

export async function runMeanReversionScan(
  universe: string[] = DEFAULT_WATCHLIST
): Promise<ReversionPayload> {
  const results = await Promise.all(universe.map((t) => scanTicker(t)));

  // Actionable = passed the gate and is Execute or Watch.
  const actionable = results.filter((r) => r.decision.outputState !== "Reject");

  const bullishReversions = actionable
    .filter((r) => r.decision.bias === "BULLISH")
    .sort(rank)
    .slice(0, MAX_SLOTS);

  const bearishReversions = actionable
    .filter((r) => r.decision.bias === "BEARISH")
    .sort(rank)
    .slice(0, MAX_SLOTS);

  return {
    generatedAt: new Date().toISOString(),
    universe,
    bullishReversions,
    bearishReversions,
    summary: {
      execute: results.filter((r) => r.decision.outputState === "Execute").length,
      watch: results.filter((r) => r.decision.outputState === "Watch").length,
      reject: results.filter((r) => r.decision.outputState === "Reject").length,
    },
  };
}

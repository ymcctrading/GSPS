/**
 * Novice homepage — "market regime" summary.
 *
 * A single, cheap regime read on a broad-market benchmark (SPY daily bars),
 * using `lib/signals/regime.ts` directly rather than the full `scanTicker`
 * pipeline (fans, structural levels, per-symbol scoring) that a ticker page
 * needs — the homepage only needs a plain-language market backdrop, not a
 * trade plan for SPY itself.
 *
 * Fails soft: any data-provider error returns `null` rather than throwing,
 * so a benchmark-data hiccup degrades this one card, not the dashboard.
 */

import { getMarketDataProvider } from "@/lib/data/provider";
import { classifyRegime } from "@/lib/signals/regime";
import type { Regime } from "@/lib/signals/types";

export interface MarketRegimeSummary {
  regime: Regime;
  direction: "bullish" | "bearish" | "sideways";
  label: string;
}

const BENCHMARK_SYMBOL = "SPY";

const REGIME_LABEL: Record<Regime, string> = {
  trend: "Trending",
  range: "Range-bound",
  transition: "Transitioning",
  event: "Elevated event risk",
};

export async function getMarketRegimeSummary(now: Date = new Date()): Promise<MarketRegimeSummary | null> {
  try {
    const provider = getMarketDataProvider();
    const yearAgo = new Date(now.getTime() - 365 * 24 * 3600 * 1000);
    const daily = await provider.fetchBars(BENCHMARK_SYMBOL, "1Day", yearAgo, null, "us_equity");
    if (!daily || daily.length < 60) return null;

    const read = classifyRegime({ bars: daily });
    return { regime: read.regime, direction: read.direction, label: REGIME_LABEL[read.regime] };
  } catch (err) {
    console.error(`promotion: market regime read failed — ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * Daily market-wide reversion scan.
 *
 * Coarse pass: pull the most-active US equities, score cheap daily-bar signals
 * (trend extension + proximity to Gann/S-R levels) to shortlist candidates.
 * Full pass: run the complete multi-timeframe scanTicker on the shortlist and
 * keep the top 15 bullish + top 15 bearish reversion setups.
 */

import type { Bar, ScanResult } from "@/lib/types";
import { fetchBars, fetchMostActives } from "@/lib/data/alpaca";
import { readTrend } from "@/lib/analysis/trend";
import { computeFanLines } from "@/lib/gann/fans";
import { squareOf9Levels } from "@/lib/gann/squareOf9";
import { scanTicker } from "@/lib/scanTicker";
import { MAG7, SECTORS } from "@/lib/sectors";

// Fallback universe when the most-actives screener is unavailable (some Alpaca
// plans don't include it): the curated sector lists, equities only.
const FALLBACK_UNIVERSE = Array.from(
  new Set([
    ...MAG7,
    ...Object.values(SECTORS).flatMap((s) => s.symbols),
  ]),
).filter((s) => !s.includes("/"));

async function resolveUniverse(universeTop: number): Promise<string[]> {
  try {
    const actives = await fetchMostActives(universeTop);
    if (actives.length > 0) return actives;
  } catch {
    /* screener unavailable — fall back to the curated universe */
  }
  return FALLBACK_UNIVERSE;
}

interface CoarseCandidate {
  symbol: string;
  direction: "bullish" | "bearish";
  coarseScore: number;
}

function coarseScore(symbol: string, daily: Bar[]): CoarseCandidate | null {
  if (daily.length < 60) return null;
  const price = daily[daily.length - 1].c;
  const trend = readTrend(daily, "1Day");
  if (trend.direction === "sideways") return null;

  // A reversion candidate moves opposite its current extended trend.
  const direction = trend.direction === "bearish" ? "bullish" : "bearish";

  let score = 0;

  // Extension: distance of price from its 50-bar mean, in % — more extended,
  // more primed for reversion.
  const closes = daily.slice(-50).map((b) => b.c);
  const mean = closes.reduce((s, c) => s + c, 0) / closes.length;
  const extensionPct = (Math.abs(price - mean) / mean) * 100;
  if (extensionPct > 5) score += 1;
  if (extensionPct > 10) score += 1;

  // Proximity to a Gann fan line or Square-of-9 level
  const fans = computeFanLines(daily, price);
  if (fans.length > 0 && fans[0].distancePct <= 1.5) score += 2;
  const majorLow = Math.min(...daily.map((b) => b.l));
  const s9 = squareOf9Levels(majorLow, price);
  if (s9.length > 0 && s9[0].distancePct <= 1.0) score += 2;

  // Proximity to a clustered S/R level in the reversion direction
  const levels = direction === "bullish" ? trend.support : trend.resistance;
  if (levels.some((l) => (Math.abs(price - l) / price) * 100 <= 2)) score += 2;

  if (score < 3) return null;
  return { symbol, direction, coarseScore: score };
}

export interface MarketScanOutput {
  scanDate: string;
  bullish: ScanResult[];
  bearish: ScanResult[];
  universeSize: number;
  shortlisted: number;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function runMarketScan(universeTop = 100, perSide = 15): Promise<MarketScanOutput> {
  const scanDate = new Date().toISOString().slice(0, 10);

  const actives = await resolveUniverse(universeTop);

  // Coarse pass on daily bars only
  const yearAgo = new Date(Date.now() - 365 * 24 * 3600 * 1000);
  const end = new Date(Date.now() - 16 * 60 * 1000);
  const coarse = await mapWithConcurrency(actives, 8, async (symbol) => {
    try {
      const daily = await fetchBars(symbol, "1Day", yearAgo, end, "us_equity");
      return coarseScore(symbol, daily);
    } catch {
      return null;
    }
  });

  const shortlist = coarse
    .filter((c): c is CoarseCandidate => c !== null)
    .sort((a, b) => b.coarseScore - a.coarseScore)
    .slice(0, perSide * 4); // full-scan up to 60 candidates

  // Full multi-timeframe pass
  const full = await mapWithConcurrency(shortlist, 5, (c) => scanTicker(c.symbol));
  const valid = full.filter((r) => !r.error);

  const rank = (dir: "bullish" | "bearish") =>
    valid
      .filter((r) => r.direction === dir || (r.direction === "none" && shortlist.find((c) => c.symbol === r.symbol)?.direction === dir))
      .sort((a, b) => b.decision.score - a.decision.score)
      .slice(0, perSide);

  return {
    scanDate,
    bullish: rank("bullish"),
    bearish: rank("bearish"),
    universeSize: actives.length,
    shortlisted: shortlist.length,
  };
}

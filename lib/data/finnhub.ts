/**
 * Finnhub — real analyst rating for the Company tab (price target attempted
 * too, but see below).
 *
 * Confirmed live against a real key (2026-08-19): `/stock/recommendation`
 * (analyst rating) is free-tier. `/stock/price-target` 403s on the free
 * tier — despite Finnhub's own docs listing it as free, it now requires a
 * paid plan — so in practice price target stays on the simulated generator
 * unless the key is upgraded. Short interest and institutional/13F
 * ownership were never attempted here; Finnhub doesn't have those on any
 * tier this app has checked. Everything not fetched from here stays on the
 * seeded generator in lib/data/company.ts. Both fetchers return `null` on
 * any failure (missing key, network error, empty response, rate limit, a
 * plan that doesn't cover the endpoint) rather than throwing — the caller
 * falls back to simulated data for that section, the same "degrade, don't
 * break" seam every other provider in this app uses.
 */

import { consensusFromBullishness, type AnalystRating } from "./company";

const FINNHUB_BASE = "https://finnhub.io/api/v1";
const TIMEOUT_MS = 4000;

async function finnhubGet(path: string, params: Record<string, string>): Promise<unknown> {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) return null; // Expected/common (local dev, unconfigured env) — not worth logging.

  const url = new URL(`${FINNHUB_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("token", apiKey);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      // A key IS configured here, so a failure is worth knowing about — this is
      // the only signal distinguishing "not wired up" from "wired up but broken"
      // (expired/invalid key, plan doesn't cover this endpoint, rate limited).
      console.warn(`[finnhub] ${path} → HTTP ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.warn(`[finnhub] ${path} failed:`, err instanceof Error ? err.message : String(err));
    return null;
  } finally {
    clearTimeout(timer);
  }
}

interface RecommendationTrend {
  symbol: string;
  period: string; // "YYYY-MM-01"
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
}

export async function fetchFinnhubAnalystRating(symbol: string): Promise<AnalystRating | null> {
  const data = (await finnhubGet("/stock/recommendation", { symbol })) as
    | RecommendationTrend[]
    | null;
  if (!Array.isArray(data) || data.length === 0) return null;

  // Finnhub returns trailing months, most recent first.
  const latest = data[0];
  const total = latest.strongBuy + latest.buy + latest.hold + latest.sell + latest.strongSell;
  if (total <= 0) return null;

  const bullishness =
    (latest.strongBuy * 1 + latest.buy * 0.75 + latest.hold * 0.5 + latest.sell * 0.25) / total;

  return {
    totalAnalysts: total,
    strongBuyPct: Math.round((latest.strongBuy / total) * 100),
    buyPct: Math.round((latest.buy / total) * 100),
    holdPct: Math.round((latest.hold / total) * 100),
    underperformPct: Math.round((latest.sell / total) * 100),
    sellPct: Math.round((latest.strongSell / total) * 100),
    consensus: consensusFromBullishness(bullishness),
    bullishness: Math.round(bullishness * 100) / 100,
  };
}

interface PriceTargetResponse {
  symbol: string;
  targetHigh: number;
  targetLow: number;
  targetMean: number;
  targetMedian: number;
  lastUpdated: string;
}

export async function fetchFinnhubPriceTarget(
  symbol: string,
  currentPrice: number,
): Promise<{ avg: number; high: number; low: number; upsidePct: number } | null> {
  const data = (await finnhubGet("/stock/price-target", { symbol })) as PriceTargetResponse | null;
  if (!data || !data.targetMean || currentPrice <= 0) return null;

  return {
    avg: Math.round(data.targetMean * 100) / 100,
    high: Math.round(data.targetHigh * 100) / 100,
    low: Math.round(data.targetLow * 100) / 100,
    upsidePct: Math.round(((data.targetMean - currentPrice) / currentPrice) * 10000) / 100,
  };
}

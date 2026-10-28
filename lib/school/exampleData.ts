/**
 * Server side of the School's live examples: reads the learner's markets'
 * completed daily bars and picks the example a lesson asks for
 * (`./examples.ts`). One read per market per New York day per server
 * instance (an in-memory cache), batched for stocks, so opening lesson after
 * lesson costs no new data requests and nothing here touches the scan.
 *
 * Engineering choices, labelled: five years of daily bars (enough to reach a
 * bear market in most names); SPY stands in when none of the learner's
 * markets has the example; today's bar is left out until the day is over.
 */

import type { AssetClass, Bar } from "@/lib/types";
import { getMarketDataProvider } from "@/lib/data/provider";
import { etDateKey } from "@/lib/market/session";
import { chooseExample, type ChosenExample, type ExampleKind } from "./examples";
import type { SchoolPick } from "./picks";

export const EXAMPLE_YEARS = 5;
export const STAND_IN_SYMBOL = "SPY";

/** Engineering bound on the per-instance cache. */
const MAX_CACHED = 2000;
const cache = new Map<string, { day: string; bars: Bar[] }>();

function barDay(bar: Bar, crypto: boolean): string {
  const d = new Date(bar.t);
  return crypto ? d.toISOString().slice(0, 10) : etDateKey(d);
}

/** Bars of completed days only: drops the bar dated today (New York for stocks, UTC for crypto). */
export function completedDays(bars: Bar[], crypto: boolean, now: Date): Bar[] {
  const today = crypto ? now.toISOString().slice(0, 10) : etDateKey(now);
  return bars.filter((b) => Number.isFinite(Date.parse(b.t)) && barDay(b, crypto) < today);
}

async function readBars(symbols: string[], assetClass: AssetClass, now: Date): Promise<Map<string, Bar[]>> {
  const day = etDateKey(now);
  const out = new Map<string, Bar[]>();
  const missing: string[] = [];
  for (const s of symbols) {
    const hit = cache.get(s);
    if (hit && hit.day === day) out.set(s, hit.bars);
    else missing.push(s);
  }
  if (missing.length === 0) return out;
  const provider = getMarketDataProvider();
  const start = new Date(now.getTime() - EXAMPLE_YEARS * 365.25 * 86_400_000);
  const crypto = assetClass === "crypto";
  let fetched: Map<string, Bar[]>;
  if (provider.fetchBarsBatch && !crypto) {
    fetched = await provider.fetchBarsBatch(missing, "1Day", start, now, assetClass);
  } else {
    fetched = new Map();
    await Promise.all(
      missing.map(async (s) => {
        try {
          fetched.set(s, await provider.fetchBars(s, "1Day", start, now, assetClass));
        } catch {
          // A market that can't be read supplies no example; the others still can.
        }
      }),
    );
  }
  for (const s of missing) {
    const raw = fetched.get(s) ?? fetched.get(s.replace("/", "")) ?? null;
    if (!raw) continue;
    const bars = completedDays(raw, crypto, now);
    if (cache.size >= MAX_CACHED) cache.clear();
    cache.set(s, { day, bars });
    out.set(s, bars);
  }
  return out;
}

export interface LessonExamplesResult {
  examples: { kind: ExampleKind; example: ChosenExample | null }[];
  /** Markets picked that have no chart bars here yet (futures, forex). */
  noCharts: string[];
  /** Markets read with under a year of history. */
  shortHistory: string[];
}

export async function loadLessonExamples(
  picks: readonly SchoolPick[],
  kinds: readonly ExampleKind[],
  now: Date = new Date(),
): Promise<LessonExamplesResult> {
  const stocks = picks.filter((p) => p.kind === "us_equity").map((p) => p.symbol);
  const crypto = picks.filter((p) => p.kind === "crypto").map((p) => p.symbol);
  const noCharts = picks.filter((p) => p.kind === "future" || p.kind === "forex").map((p) => p.symbol);
  if (kinds.length === 0) return { examples: [], noCharts, shortHistory: [] };

  const withStandIn = stocks.includes(STAND_IN_SYMBOL) ? stocks : [...stocks, STAND_IN_SYMBOL];
  const [stockBars, cryptoBars] = await Promise.all([
    readBars(withStandIn, "us_equity", now).catch(() => new Map<string, Bar[]>()),
    crypto.length ? readBars(crypto, "crypto", now).catch(() => new Map<string, Bar[]>()) : Promise.resolve(new Map<string, Bar[]>()),
  ]);
  const all = new Map<string, Bar[]>([...stockBars, ...cryptoBars]);
  const order = picks.map((p) => p.symbol).filter((s) => all.has(s));
  const standInBars = stockBars.get(STAND_IN_SYMBOL);
  const standIn = standInBars ? { symbol: STAND_IN_SYMBOL, bars: standInBars } : null;

  return {
    examples: kinds.map((kind) => ({ kind, example: chooseExample(kind, all, order, standIn) })),
    noCharts,
    shortHistory: order.filter((s) => (all.get(s)?.length ?? 0) < 250),
  };
}

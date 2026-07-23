/**
 * GET /api/candles?symbol=AAPL&tf=1D&eth=0
 *
 * Free, no-key OHLCV source (Yahoo Finance chart API) normalized to the
 * KLineCharts shape. Honors the GSPS timeframe ladder + lookback windows and the
 * Extended Trading Hours toggle (includePrePost). Falls back to a deterministic
 * simulated series if the upstream is unavailable, so the chart always renders.
 *
 * Swap the upstream for Alpaca/Polygon later by editing fetchYahoo — the client
 * contract (the JSON candle array) stays the same.
 */

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Candle = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type TfSpec = { interval: string; range: string; aggregate?: number };

// Timeframe → Yahoo interval + lookback range (per docs/CHARTING_SPEC.md).
const TF_MAP: Record<string, TfSpec> = {
  "1m": { interval: "1m", range: "5d" },
  "5m": { interval: "5m", range: "1mo" },
  "15m": { interval: "15m", range: "1mo" },
  "1H": { interval: "60m", range: "3mo" },
  "4H": { interval: "60m", range: "6mo", aggregate: 4 },
  "1D": { interval: "1d", range: "5y" },
  "1W": { interval: "1wk", range: "10y" },
  "1M": { interval: "1mo", range: "max" },
};

function normalizeSymbol(symbol: string): string {
  // BTC/USD → BTC-USD for Yahoo crypto pairs.
  return symbol.trim().toUpperCase().replace("/", "-");
}

function aggregate(candles: Candle[], factor: number): Candle[] {
  if (factor <= 1) return candles;
  const out: Candle[] = [];
  for (let i = 0; i < candles.length; i += factor) {
    const chunk = candles.slice(i, i + factor);
    if (!chunk.length) break;
    out.push({
      timestamp: chunk[0].timestamp,
      open: chunk[0].open,
      close: chunk[chunk.length - 1].close,
      high: Math.max(...chunk.map((c) => c.high)),
      low: Math.min(...chunk.map((c) => c.low)),
      volume: chunk.reduce((s, c) => s + c.volume, 0),
    });
  }
  return out;
}

async function fetchYahoo(
  symbol: string,
  spec: TfSpec,
  eth: boolean,
): Promise<Candle[]> {
  const params = new URLSearchParams({
    interval: spec.interval,
    range: spec.range,
    includePrePost: eth ? "true" : "false",
  });
  const hosts = [
    "https://query1.finance.yahoo.com",
    "https://query2.finance.yahoo.com",
  ];
  for (const host of hosts) {
    try {
      const res = await fetch(
        `${host}/v8/finance/chart/${encodeURIComponent(symbol)}?${params}`,
        {
          headers: { "User-Agent": "Mozilla/5.0 (GSPS)" },
          cache: "no-store",
        },
      );
      if (!res.ok) continue;
      const json = await res.json();
      const result = json?.chart?.result?.[0];
      const ts: number[] = result?.timestamp ?? [];
      const q = result?.indicators?.quote?.[0] ?? {};
      const candles: Candle[] = [];
      for (let i = 0; i < ts.length; i++) {
        const o = q.open?.[i];
        const h = q.high?.[i];
        const l = q.low?.[i];
        const c = q.close?.[i];
        if (o == null || h == null || l == null || c == null) continue;
        candles.push({
          timestamp: ts[i] * 1000,
          open: o,
          high: h,
          low: l,
          close: c,
          volume: q.volume?.[i] ?? 0,
        });
      }
      if (candles.length) return aggregate(candles, spec.aggregate ?? 1);
    } catch {
      /* try next host */
    }
  }
  return [];
}

// Deterministic fallback so the chart is never blank.
function simulated(symbol: string, tf: string): Candle[] {
  let seed = 0;
  for (const ch of symbol + tf) seed = (seed * 31 + ch.charCodeAt(0)) % 2147483647;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const stepMs = 86_400_000;
  const count = 160;
  const start = Date.now() - count * stepMs;
  let price = 100;
  const out: Candle[] = [];
  for (let i = 0; i < count; i++) {
    const open = price;
    const close = Math.max(0.5, open + (rand() - 0.5) * 2);
    out.push({
      timestamp: start + i * stepMs,
      open,
      close,
      high: Math.max(open, close) + rand(),
      low: Math.min(open, close) - rand(),
      volume: Math.round(50_000 + rand() * 500_000),
    });
    price = close;
  }
  return out;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawSymbol = searchParams.get("symbol");
  const tf = searchParams.get("tf") ?? "1D";
  const eth = searchParams.get("eth") === "1";

  if (!rawSymbol) {
    return NextResponse.json({ error: "Missing 'symbol'" }, { status: 400 });
  }

  const spec = TF_MAP[tf] ?? TF_MAP["1D"];
  const symbol = normalizeSymbol(rawSymbol);

  let candles = await fetchYahoo(symbol, spec, eth);
  let source: "live" | "simulated" = "live";
  if (!candles.length) {
    candles = simulated(symbol, tf);
    source = "simulated";
  }

  return NextResponse.json(
    { symbol, tf, eth, source, candles },
    { headers: { "Cache-Control": "s-maxage=30, stale-while-revalidate=60" } },
  );
}

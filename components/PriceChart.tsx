"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Combined GSPS chart: candlesticks + volume + MACD + RSI sub-charts, protocol
 * overlay lines (Entry / Stop / TP1 / Master), OHLC crosshair tooltip, and the
 * full timeframe ladder. KLineCharts (free, MIT) is loaded lazily on the client.
 *
 * Data is currently a deterministic sample series so the chart renders before
 * the live market-data feed is wired (MarketDataIngestor). Swap `sampleCandles`
 * for a fetch to the data provider to go live.
 */

export type ProtocolLevels = {
  entry?: number | null;
  stop?: number | null;
  tp1?: number | null;
  master?: number | null;
};

const TIMEFRAMES = [
  "1m", "5m", "15m", "1H", "4H", "1D", "1W", "1M",
] as const;
type Timeframe = (typeof TIMEFRAMES)[number];

const TF_MINUTES: Record<Timeframe, number> = {
  "1m": 1, "5m": 5, "15m": 15, "1H": 60, "4H": 240,
  "1D": 1440, "1W": 10080, "1M": 43200,
};

/** Deterministic random-walk candles seeded by symbol + timeframe. */
function sampleCandles(symbol: string, tf: Timeframe, count = 160, base = 100) {
  let seed = 0;
  for (const ch of symbol + tf) seed = (seed * 31 + ch.charCodeAt(0)) % 2147483647;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const stepMs = TF_MINUTES[tf] * 60_000;
  const start = Date.now() - count * stepMs;
  let price = base;
  const out = [];
  for (let i = 0; i < count; i++) {
    const drift = (rand() - 0.5) * base * 0.01;
    const open = price;
    const close = Math.max(0.5, open + drift);
    const high = Math.max(open, close) + rand() * base * 0.004;
    const low = Math.min(open, close) - rand() * base * 0.004;
    const volume = Math.round(50_000 + rand() * 500_000);
    out.push({ timestamp: start + i * stepMs, open, high, low, close, volume });
    price = close;
  }
  return out;
}

export function PriceChart({
  symbol,
  levels,
  basePrice = 100,
}: {
  symbol: string;
  levels: ProtocolLevels;
  basePrice?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<unknown>(null);
  const [tf, setTf] = useState<Timeframe>("1D");

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};

    (async () => {
      const kline = await import("klinecharts");
      if (disposed || !containerRef.current) return;
      const chart = kline.init(containerRef.current);
      if (!chart) return;
      chartRef.current = chart;

      chart.applyNewData(sampleCandles(symbol, tf, 160, basePrice));

      try {
        chart.createIndicator("VOL", false, { id: "candle_pane" });
        chart.createIndicator("MACD", false, { id: "pane_macd" });
        chart.createIndicator("RSI", false, { id: "pane_rsi" });
      } catch {
        /* indicator API differences — non-fatal */
      }

      const lines: [number | null | undefined, string, string][] = [
        [levels.master, "#16a34a", "Master"],
        [levels.tp1, "#16a34a", "TP1"],
        [levels.entry, "#2563eb", "Entry"],
        [levels.stop, "#dc2626", "Stop"],
      ];
      for (const [value, color, label] of lines) {
        if (value == null) continue;
        try {
          chart.createOverlay({
            name: "priceLine",
            points: [{ value }],
            styles: { line: { color }, text: { color } },
            extendData: label,
          } as never);
        } catch {
          /* overlay API differences — non-fatal */
        }
      }

      cleanup = () => {
        try {
          kline.dispose(containerRef.current as HTMLDivElement);
        } catch {
          /* noop */
        }
      };
    })();

    return () => {
      disposed = true;
      cleanup();
    };
  }, [symbol, tf, basePrice, levels]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1">
        {TIMEFRAMES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTf(t)}
            className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
              tf === t
                ? "bg-blue-50 text-brand-blue"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      <div ref={containerRef} className="h-[440px] w-full" />
    </div>
  );
}

export default PriceChart;

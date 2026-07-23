"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Combined GSPS chart: candlesticks + volume + MACD + RSI sub-charts, protocol
 * overlay lines (Entry / Stop / TP1 / Master), OHLC crosshair tooltip, the full
 * timeframe ladder, and an Extended Trading Hours toggle.
 *
 * Candle data comes from /api/candles (free Yahoo source, no key, with a
 * simulated fallback). KLineCharts (free, MIT) loads lazily on the client.
 */

export type ProtocolLevels = {
  entry?: number | null;
  stop?: number | null;
  tp1?: number | null;
  master?: number | null;
};

const TIMEFRAMES = ["1m", "5m", "15m", "1H", "4H", "1D", "1W", "1M"] as const;
type Timeframe = (typeof TIMEFRAMES)[number];

type Candle = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export function PriceChart({
  symbol,
  levels,
}: {
  symbol: string;
  levels: ProtocolLevels;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tf, setTf] = useState<Timeframe>("1D");
  const [eth, setEth] = useState(false);
  const [source, setSource] = useState<"live" | "simulated" | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    setLoading(true);

    (async () => {
      const kline = await import("klinecharts");
      let candles: Candle[] = [];
      try {
        const res = await fetch(
          `/api/candles?symbol=${encodeURIComponent(symbol)}&tf=${tf}&eth=${
            eth ? 1 : 0
          }`,
        );
        const json = await res.json();
        candles = json.candles ?? [];
        if (!disposed) setSource(json.source ?? null);
      } catch {
        /* leave candles empty */
      }
      if (disposed || !containerRef.current) return;

      const chart = kline.init(containerRef.current);
      if (!chart) return;
      chart.applyNewData(candles);

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

      if (!disposed) setLoading(false);
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
  }, [symbol, tf, eth, levels]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-1">
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
        <button
          type="button"
          onClick={() => setEth((v) => !v)}
          className={`ml-2 rounded-md border px-3 py-1 text-xs font-semibold transition-colors ${
            eth
              ? "border-brand-blue bg-blue-50 text-brand-blue"
              : "border-[var(--border)] text-slate-500"
          }`}
          title="Show pre-market & after-hours sessions"
        >
          ETH {eth ? "on" : "off"}
        </button>
        <span className="ml-auto text-xs text-slate-400">
          {loading
            ? "loading…"
            : source === "simulated"
              ? "simulated data"
              : "live"}
        </span>
      </div>
      <div ref={containerRef} className="h-[440px] w-full" />
    </div>
  );
}

export default PriceChart;

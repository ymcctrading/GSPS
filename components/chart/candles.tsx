"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";
import type { Bar, Timeframe } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface PriceMarker {
  price: number;
  label: string;
  kind: "entry" | "stop" | "target" | "gann";
}

const TIMEFRAMES: Timeframe[] = ["1Month", "1Week", "1Day", "1Hour", "15Min", "5Min", "1Min"];
const TF_LABEL: Record<Timeframe, string> = {
  "1Month": "10Y",
  "1Week": "5Y",
  "1Day": "1Y",
  "1Hour": "1H",
  "15Min": "15M",
  "5Min": "5M",
  "1Min": "1M",
};
// Intraday timeframes get live price polling.
const LIVE_TFS: Timeframe[] = ["1Hour", "15Min", "5Min", "1Min"];

const MARKER_COLOR: Record<PriceMarker["kind"], string> = {
  entry: "#2563eb",
  stop: "#dc2626",
  target: "#059669",
  gann: "#94a3b8",
};

function isCryptoSym(sym: string): boolean {
  const known = ["BTC", "ETH", "SOL", "DOGE", "LTC", "AVAX", "LINK", "XRP", "BCH", "UNI"];
  const base = sym.toUpperCase().replace(/[-/]?USD[TC]?$/, "");
  return sym.includes("/") || known.includes(base);
}

type Candle = { time: Time; open: number; high: number; low: number; close: number };

export function CandleChart({
  symbol,
  markers,
  initialTimeframe = "1Day",
}: {
  symbol: string;
  markers: PriceMarker[];
  initialTimeframe?: Timeframe;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const lastBarRef = useRef<Candle | null>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>(initialTimeframe);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [showGann, setShowGann] = useState(true);
  const [live, setLive] = useState(false);

  const crypto = isCryptoSym(symbol);

  // Create the chart once.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const styles = getComputedStyle(document.documentElement);
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { color: "transparent" },
        textColor: styles.getPropertyValue("--muted").trim() || "#64748b",
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "rgba(148,163,184,0.12)" },
        horzLines: { color: "rgba(148,163,184,0.12)" },
      },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
      crosshair: { mode: 0 },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#059669",
      downColor: "#dc2626",
      borderVisible: false,
      wickUpColor: "#059669",
      wickDownColor: "#dc2626",
    });

    chartRef.current = chart;
    seriesRef.current = series;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Load bars for the active timeframe.
  const loadBars = useCallback(
    async (opts?: { keepView?: boolean }) => {
      if (!opts?.keepView) setStatus("loading");
      try {
        const res = await fetch(`/api/bars?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}`);
        if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
        const data: { bars: Bar[] } = await res.json();
        if (!seriesRef.current) return;
        const candles: Candle[] = data.bars.map((b) => ({
          time: (new Date(b.t).getTime() / 1000) as Time,
          open: b.o,
          high: b.h,
          low: b.l,
          close: b.c,
        }));
        seriesRef.current.setData(candles);
        lastBarRef.current = candles[candles.length - 1] ?? null;
        if (!opts?.keepView) chartRef.current?.timeScale().fitContent();
        setStatus("ready");
      } catch (err) {
        if (opts?.keepView) return; // background refresh failure — keep current chart
        setErrorMsg(err instanceof Error ? err.message : String(err));
        setStatus("error");
      }
    },
    [symbol, timeframe],
  );

  useEffect(() => {
    loadBars();
  }, [loadBars]);

  // Live price polling (~2s) + periodic new-bar roll for intraday timeframes.
  useEffect(() => {
    if (status !== "ready" || !LIVE_TFS.includes(timeframe)) {
      setLive(false);
      return;
    }
    setLive(true);
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch(`/api/quote?symbol=${encodeURIComponent(symbol)}`);
        if (!res.ok) return;
        const { price } = await res.json();
        const lb = lastBarRef.current;
        if (cancelled || typeof price !== "number" || !seriesRef.current || !lb) return;
        lb.high = Math.max(lb.high, price);
        lb.low = Math.min(lb.low, price);
        lb.close = price;
        seriesRef.current.update(lb);
      } catch {
        /* transient — keep polling */
      }
    };

    poll();
    const priceInterval = setInterval(poll, 2000);
    const rollInterval = setInterval(() => loadBars({ keepView: true }), 30000);

    return () => {
      cancelled = true;
      clearInterval(priceInterval);
      clearInterval(rollInterval);
      setLive(false);
    };
  }, [symbol, timeframe, status, loadBars]);

  // Price-line overlays. Gann lines are toggleable to reduce clutter.
  const displayMarkers = showGann ? markers : markers.filter((m) => m.kind !== "gann");
  useEffect(() => {
    const series = seriesRef.current;
    if (!series || status !== "ready") return;
    const lines = displayMarkers.map((m) =>
      series.createPriceLine({
        price: m.price,
        color: MARKER_COLOR[m.kind],
        lineWidth: m.kind === "gann" ? 1 : 2,
        lineStyle: m.kind === "gann" ? 3 : 0,
        axisLabelVisible: true,
        title: m.label,
      }),
    );
    return () => lines.forEach((l) => series.removePriceLine(l));
  }, [displayMarkers, status]);

  const hasGann = markers.some((m) => m.kind === "gann");

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium cursor-pointer",
                tf === timeframe ? "bg-accent-soft text-accent" : "text-muted hover:text-foreground",
              )}
            >
              {TF_LABEL[tf]}
            </button>
          ))}
        </div>
        {live && (
          <span className="flex items-center gap-1.5 text-xs font-medium text-bull">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-bull opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-bull" />
            </span>
            LIVE
          </span>
        )}
        {hasGann && (
          <label className="ml-auto flex items-center gap-1.5 text-xs text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={showGann}
              onChange={(e) => setShowGann(e.target.checked)}
              className="h-3.5 w-3.5 accent-[var(--accent)]"
            />
            Show Gann levels
          </label>
        )}
      </div>

      <div className="relative h-[420px] w-full">
        <div ref={containerRef} className="absolute inset-0" />
        {status === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">
            Loading chart…
          </div>
        )}
        {status === "error" && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-bear">
            {errorMsg}
          </div>
        )}
      </div>

      {/* Legend — explains the lines cluttering the right edge. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <LegendItem color="#2563eb" label="Entry" />
        <LegendItem color="#dc2626" label="Stop loss" />
        <LegendItem color="#059669" label="TP1 & Master (profit targets)" />
        <LegendItem color="#94a3b8" dashed label="Gann levels (support/resistance zones)" />
        <span className="text-muted/80">
          {crypto
            ? "Crypto: live, up-to-the-second."
            : "Stocks: bars are ~15 min delayed on the free data feed; last price ticks live."}
        </span>
      </div>
    </div>
  );
}

function LegendItem({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="inline-block h-0 w-4"
        style={{ borderTop: `2px ${dashed ? "dashed" : "solid"} ${color}` }}
      />
      {label}
    </span>
  );
}

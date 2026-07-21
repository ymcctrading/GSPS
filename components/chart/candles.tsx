"use client";

import { useEffect, useRef, useState } from "react";
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

const TIMEFRAMES: Timeframe[] = ["1Month", "1Week", "1Day", "1Hour", "15Min"];
const TF_LABEL: Record<Timeframe, string> = {
  "1Month": "10Y",
  "1Week": "5Y",
  "1Day": "1Y",
  "1Hour": "1H",
  "15Min": "15M",
};

const MARKER_COLOR: Record<PriceMarker["kind"], string> = {
  entry: "#2563eb",
  stop: "#dc2626",
  target: "#059669",
  gann: "#94a3b8",
};

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
  const [timeframe, setTimeframe] = useState<Timeframe>(initialTimeframe);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  // Create the chart once
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
      timeScale: { borderVisible: false },
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

  // Load bars on timeframe change
  useEffect(() => {
    let cancelled = false;
    setStatus("loading");

    fetch(`/api/bars?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
        return res.json();
      })
      .then((data: { bars: Bar[] }) => {
        if (cancelled || !seriesRef.current) return;
        seriesRef.current.setData(
          data.bars.map((b) => ({
            time: (new Date(b.t).getTime() / 1000) as Time,
            open: b.o,
            high: b.h,
            low: b.l,
            close: b.c,
          })),
        );
        chartRef.current?.timeScale().fitContent();
        setStatus("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setErrorMsg(err instanceof Error ? err.message : String(err));
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [symbol, timeframe]);

  // Price-line overlays (entry / stop / targets / Gann levels)
  useEffect(() => {
    const series = seriesRef.current;
    if (!series || status !== "ready") return;
    const lines = markers.map((m) =>
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
  }, [markers, status]);

  return (
    <div className="flex flex-col gap-2">
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
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";
import { MousePointer2, Minus, TrendingUp, Bell, BellOff, Trash2 } from "lucide-react";
import type { Bar, Timeframe } from "@/lib/types";
import { barSession, isExtended } from "@/lib/market/session";
import { sma, ema, bollinger, rsi, volumeBars, type Candle as CalcCandle } from "@/lib/indicators";
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
// Intraday timeframes get live candle rolling + are where extended hours matter.
const INTRADAY_TFS: Timeframe[] = ["1Hour", "15Min", "5Min", "1Min"];

const MARKER_COLOR: Record<PriceMarker["kind"], string> = {
  entry: "#2563eb",
  stop: "#dc2626",
  target: "#059669",
  gann: "#94a3b8",
};

const DRAW_COLOR = "#a855f7"; // user-drawn trendlines / h-lines
const ALERT_COLOR = "#f59e0b";

// Regular-session candle colors; extended-hours prints are dimmed so they read
// as a distinct session at a glance.
const UP = "#059669";
const DOWN = "#dc2626";
const UP_EXT = "rgba(5,150,105,0.40)";
const DOWN_EXT = "rgba(220,38,38,0.40)";

type Tool = "none" | "hline" | "trend";
type Point = { time: Time; price: number };
type Trendline = { a: Point; b: Point };

// Overlay indicators drawn in the main price pane.
type Overlay = "sma20" | "sma50" | "ema9" | "bb";
// Study indicators drawn in their own pane below price.
type Study = "volume" | "rsi";

const OVERLAY_META: Record<Overlay, { label: string; color: string }> = {
  sma20: { label: "SMA 20", color: "#f59e0b" },
  sma50: { label: "SMA 50", color: "#8b5cf6" },
  ema9: { label: "EMA 9", color: "#06b6d4" },
  bb: { label: "Boll (20,2)", color: "#94a3b8" },
};
const STUDY_META: Record<Study, { label: string }> = {
  volume: { label: "Volume" },
  rsi: { label: "RSI 14" },
};

function isCryptoSym(sym: string): boolean {
  const known = ["BTC", "ETH", "SOL", "DOGE", "LTC", "AVAX", "LINK", "XRP", "BCH", "UNI"];
  const base = sym.toUpperCase().replace(/[-/]?USD[TC]?$/, "");
  return sym.includes("/") || known.includes(base);
}

function roundPrice(n: number): number {
  return n >= 100 ? Math.round(n * 100) / 100 : Math.round(n * 10000) / 10000;
}

type Candle = {
  time: Time;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  color?: string;
  wickColor?: string;
  extended?: boolean;
};

function paint(c: Candle): Candle {
  const up = c.close >= c.open;
  if (c.extended) {
    const col = up ? UP_EXT : DOWN_EXT;
    return { ...c, color: col, wickColor: col };
  }
  const col = up ? UP : DOWN;
  return { ...c, color: col, wickColor: col };
}

export function CandleChart({
  symbol,
  markers,
  livePrice,
  initialTimeframe = "1Day",
}: {
  symbol: string;
  markers: PriceMarker[];
  livePrice?: number | null;
  initialTimeframe?: Timeframe;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const lastBarRef = useRef<Candle | null>(null);
  const allBarsRef = useRef<Candle[]>([]);
  const [timeframe, setTimeframe] = useState<Timeframe>(initialTimeframe);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [showGann, setShowGann] = useState(true);
  const [showExtended, setShowExtended] = useState(true);
  const [candleData, setCandleData] = useState<Candle[]>([]);

  // ---- Indicator toggles
  const [overlays, setOverlays] = useState<Set<Overlay>>(new Set());
  const [studies, setStudies] = useState<Set<Study>>(new Set());

  // ---- Drawing tools + alert state
  const [tool, setTool] = useState<Tool>("none");
  const [hlines, setHlines] = useState<number[]>([]);
  const [trendlines, setTrendlines] = useState<Trendline[]>([]);
  const [pending, setPending] = useState<Point | null>(null);
  const [alertPrice, setAlertPrice] = useState<number | null>(null);
  const [alertHit, setAlertHit] = useState<string | null>(null);

  // Refs mirror state for use inside imperative chart event handlers.
  const toolRef = useRef<Tool>(tool);
  const pendingRef = useRef<Point | null>(pending);
  const alertRef = useRef<number | null>(alertPrice);
  const draggingRef = useRef(false);
  const lastPriceRef = useRef<number | null>(null);
  useEffect(() => void (toolRef.current = tool), [tool]);
  useEffect(() => void (pendingRef.current = pending), [pending]);
  useEffect(() => void (alertRef.current = alertPrice), [alertPrice]);

  const crypto = isCryptoSym(symbol);
  const assetClass = crypto ? "crypto" : "us_equity";
  const intraday = INTRADAY_TFS.includes(timeframe);
  const live = intraday && status === "ready";
  // Extended-hours only applies to intraday stock charts.
  const extendedApplies = !crypto && intraday;

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
      upColor: UP,
      downColor: DOWN,
      borderVisible: false,
      wickUpColor: UP,
      wickDownColor: DOWN,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    // Click-to-draw. Reads the active tool via ref to avoid stale closures.
    const onClick = (param: { time?: Time; point?: { x: number; y: number } }) => {
      const activeTool = toolRef.current;
      if (activeTool === "none" || !param.point || !seriesRef.current) return;
      const price = seriesRef.current.coordinateToPrice(param.point.y);
      if (price == null) return;

      if (activeTool === "hline") {
        setHlines((prev) => [...prev, roundPrice(price)]);
        setTool("none");
        return;
      }
      // Trendline: two clicks. param.time can be null outside the data range.
      if (param.time == null) return;
      const point: Point = { time: param.time, price };
      const first = pendingRef.current;
      if (!first) {
        setPending(point);
      } else {
        setTrendlines((prev) => [...prev, { a: first, b: point }]);
        setPending(null);
        setTool("none");
      }
    };
    chart.subscribeClick(onClick);

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Push the current bar set (respecting the extended-hours toggle) to the series.
  const render = useCallback(
    (opts?: { keepView?: boolean }) => {
      const series = seriesRef.current;
      if (!series) return;
      const bars = extendedApplies && !showExtended
        ? allBarsRef.current.filter((b) => !b.extended)
        : allBarsRef.current;
      series.setData(bars);
      lastBarRef.current = bars[bars.length - 1] ?? null;
      if (!opts?.keepView) chartRef.current?.timeScale().fitContent();
    },
    [extendedApplies, showExtended],
  );

  // Load bars for the active timeframe.
  const loadBars = useCallback(
    async (opts?: { keepView?: boolean }) => {
      if (!opts?.keepView) setStatus("loading");
      try {
        const res = await fetch(`/api/bars?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}`);
        if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
        const data: { bars: Bar[] } = await res.json();
        if (!seriesRef.current) return;
        const candles = data.bars.map((b) =>
          paint({
            time: (new Date(b.t).getTime() / 1000) as Time,
            open: b.o,
            high: b.h,
            low: b.l,
            close: b.c,
            volume: b.v,
            extended: isExtended(barSession(b.t, assetClass)),
          }),
        );
        allBarsRef.current = candles;
        setCandleData(candles);
        render(opts);
        setStatus("ready");
      } catch (err) {
        if (opts?.keepView) return; // background refresh failure — keep current chart
        setErrorMsg(err instanceof Error ? err.message : String(err));
        setStatus("error");
      }
    },
    [symbol, timeframe, assetClass, render],
  );

  useEffect(() => {
    loadBars();
  }, [loadBars]);

  // Reset drawings + load the persisted alert when the symbol changes.
  useEffect(() => {
    setHlines([]);
    setTrendlines([]);
    setPending(null);
    setTool("none");
    setAlertHit(null);
    let stored: number | null = null;
    try {
      const raw = localStorage.getItem(`gsps.alert.${symbol.toUpperCase()}`);
      stored = raw ? Number(raw) : null;
    } catch {
      /* localStorage unavailable */
    }
    setAlertPrice(stored && Number.isFinite(stored) ? stored : null);
  }, [symbol]);

  // Re-render (without refetch) when the extended-hours toggle flips.
  useEffect(() => {
    if (status === "ready") render({ keepView: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showExtended, status]);

  // Alert crossing detection against the live price.
  const checkAlertCross = useCallback((price: number) => {
    const a = alertRef.current;
    const prev = lastPriceRef.current;
    lastPriceRef.current = price;
    if (a == null || prev == null) return;
    const crossedUp = prev < a && price >= a;
    const crossedDown = prev > a && price <= a;
    if (crossedUp || crossedDown) {
      const msg = `Price ${crossedUp ? "rose through" : "fell through"} ${a}`;
      setAlertHit(msg);
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification(`${symbol.toUpperCase()} alert`, { body: msg });
      }
    }
  }, [symbol]);

  // Live candle update: fold the polled live price (from the shared useLiveQuote
  // hook upstream) into the last bar, and check it against the price alert.
  useEffect(() => {
    if (status !== "ready" || typeof livePrice !== "number") return;
    const lb = lastBarRef.current;
    const series = seriesRef.current;
    if (!lb || !series) return;
    const updated = paint({
      ...lb,
      high: Math.max(lb.high, livePrice),
      low: Math.min(lb.low, livePrice),
      close: livePrice,
    });
    lastBarRef.current = updated;
    series.update(updated);
    checkAlertCross(livePrice);
  }, [livePrice, status, checkAlertCross]);

  // Periodic new-bar roll for intraday timeframes so a fresh candle appears.
  useEffect(() => {
    if (!live) return;
    const rollInterval = setInterval(() => loadBars({ keepView: true }), 30000);
    return () => clearInterval(rollInterval);
  }, [live, loadBars]);

  // ---- Draggable alert line: grab the line near its y-coordinate and drag.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const localY = (clientY: number) => clientY - el.getBoundingClientRect().top;
    const nearAlert = (y: number): boolean => {
      const a = alertRef.current;
      const s = seriesRef.current;
      if (a == null || !s) return false;
      const yc = s.priceToCoordinate(a);
      return yc != null && Math.abs(yc - y) < 7;
    };

    const onHover = (e: PointerEvent) => {
      if (draggingRef.current || toolRef.current !== "none") return;
      el.style.cursor = nearAlert(localY(e.clientY)) ? "ns-resize" : "";
    };
    const onDown = (e: PointerEvent) => {
      if (toolRef.current !== "none" || !nearAlert(localY(e.clientY))) return;
      draggingRef.current = true;
      el.style.cursor = "ns-resize";
      e.stopPropagation();
      e.preventDefault();
    };
    const onMove = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      const s = seriesRef.current;
      if (s) {
        const p = s.coordinateToPrice(localY(e.clientY));
        if (p != null && p > 0) setAlertPrice(roundPrice(p));
      }
      e.stopPropagation();
      e.preventDefault();
    };
    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      el.style.cursor = "";
      const a = alertRef.current;
      try {
        if (a != null) localStorage.setItem(`gsps.alert.${symbol.toUpperCase()}`, String(a));
      } catch {
        /* ignore */
      }
    };

    el.addEventListener("pointermove", onHover);
    el.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerup", onUp, true);
    return () => {
      el.removeEventListener("pointermove", onHover);
      el.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", onUp, true);
    };
  }, [symbol]);

  // Price-line overlays for scan markers. Gann lines are toggleable.
  const displayMarkers = useMemo(
    () => (showGann ? markers : markers.filter((m) => m.kind !== "gann")),
    [showGann, markers],
  );
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

  // User-drawn horizontal lines.
  useEffect(() => {
    const series = seriesRef.current;
    if (!series || status !== "ready") return;
    const lines: IPriceLine[] = hlines.map((price) =>
      series.createPriceLine({
        price,
        color: DRAW_COLOR,
        lineWidth: 1,
        lineStyle: 0,
        axisLabelVisible: true,
        title: "",
      }),
    );
    return () => lines.forEach((l) => series.removePriceLine(l));
  }, [hlines, status]);

  // User-drawn trendlines (each is a 2-point line series).
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || status !== "ready") return;
    const created: ISeriesApi<"Line">[] = trendlines.map((t) => {
      const s = chart.addSeries(LineSeries, {
        color: DRAW_COLOR,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      const pts = [
        { time: t.a.time, value: t.a.price },
        { time: t.b.time, value: t.b.price },
      ].sort((x, y) => (x.time as number) - (y.time as number));
      s.setData(pts);
      return s;
    });
    return () => created.forEach((s) => chart.removeSeries(s));
  }, [trendlines, status]);

  // The alert price line.
  useEffect(() => {
    const series = seriesRef.current;
    if (!series || status !== "ready" || alertPrice == null) return;
    const line = series.createPriceLine({
      price: alertPrice,
      color: ALERT_COLOR,
      lineWidth: 2,
      lineStyle: 2,
      axisLabelVisible: true,
      title: "⏰ alert",
    });
    return () => series.removePriceLine(line);
  }, [alertPrice, status]);

  // Indicator overlays in the main price pane (SMA/EMA/Bollinger).
  const calcCandles: CalcCandle[] = candleData.map((c) => ({
    time: c.time as number,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
  }));
  const overlayKey = [...overlays].sort().join(",");
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || status !== "ready" || calcCandles.length === 0) return;
    const created: ISeriesApi<"Line">[] = [];
    const addLine = (data: { time: number; value: number }[], color: string, width = 2, dashed = false) => {
      if (data.length === 0) return;
      const s = chart.addSeries(LineSeries, {
        color,
        lineWidth: width as 1 | 2 | 3 | 4,
        lineStyle: dashed ? 2 : 0,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      s.setData(data.map((d) => ({ time: d.time as Time, value: d.value })));
      created.push(s);
    };

    if (overlays.has("sma20")) addLine(sma(calcCandles, 20), OVERLAY_META.sma20.color);
    if (overlays.has("sma50")) addLine(sma(calcCandles, 50), OVERLAY_META.sma50.color);
    if (overlays.has("ema9")) addLine(ema(calcCandles, 9), OVERLAY_META.ema9.color);
    if (overlays.has("bb")) {
      const bb = bollinger(calcCandles, 20, 2);
      addLine(bb.upper, OVERLAY_META.bb.color, 1, true);
      addLine(bb.middle, OVERLAY_META.bb.color, 1, false);
      addLine(bb.lower, OVERLAY_META.bb.color, 1, true);
    }

    return () => created.forEach((s) => chart.removeSeries(s));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayKey, candleData, status]);

  // Study panes below price (Volume, RSI) — each in its own pane.
  const studyKey = [...studies].sort().join(",");
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || status !== "ready" || calcCandles.length === 0) return;
    const created: ISeriesApi<"Histogram" | "Line">[] = [];
    let paneIndex = 1;

    if (studies.has("volume")) {
      const vol = chart.addSeries(
        HistogramSeries,
        { priceFormat: { type: "volume" }, priceLineVisible: false, lastValueVisible: false },
        paneIndex,
      );
      vol.setData(volumeBars(calcCandles).map((v) => ({ time: v.time as Time, value: v.value, color: v.color })));
      created.push(vol);
      paneIndex += 1;
    }
    if (studies.has("rsi")) {
      const line = chart.addSeries(
        LineSeries,
        { color: "#6366f1", lineWidth: 1, priceLineVisible: false, lastValueVisible: true },
        paneIndex,
      );
      line.setData(rsi(calcCandles, 14).map((d) => ({ time: d.time as Time, value: d.value })));
      line.createPriceLine({ price: 70, color: "#dc2626", lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "70" });
      line.createPriceLine({ price: 30, color: "#059669", lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "30" });
      created.push(line);
      paneIndex += 1;
    }

    return () => created.forEach((s) => chart.removeSeries(s));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studyKey, candleData, status]);

  const toggleSet = <T,>(set: Set<T>, setSet: (s: Set<T>) => void, key: T) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSet(next);
  };

  const hasGann = markers.some((m) => m.kind === "gann");
  const hasDrawings = hlines.length > 0 || trendlines.length > 0 || pending != null;

  function toggleAlert() {
    if (alertPrice != null) {
      setAlertPrice(null);
      setAlertHit(null);
      try {
        localStorage.removeItem(`gsps.alert.${symbol.toUpperCase()}`);
      } catch {
        /* ignore */
      }
      return;
    }
    const seed = lastBarRef.current?.close ?? markers[0]?.price ?? 0;
    const price = roundPrice(seed);
    setAlertPrice(price);
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        Notification.requestPermission();
      }
      localStorage.setItem(`gsps.alert.${symbol.toUpperCase()}`, String(price));
    } catch {
      /* ignore */
    }
  }

  function clearDrawings() {
    setHlines([]);
    setTrendlines([]);
    setPending(null);
    setTool("none");
  }

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

        {/* Drawing toolbar */}
        <div className="flex items-center gap-0.5 border-l border-border pl-2">
          <ToolButton
            active={tool === "none"}
            onClick={() => {
              setTool("none");
              setPending(null);
            }}
            title="Cursor"
          >
            <MousePointer2 className="h-3.5 w-3.5" />
          </ToolButton>
          <ToolButton
            active={tool === "trend"}
            onClick={() => setTool(tool === "trend" ? "none" : "trend")}
            title="Trend line (click two points)"
          >
            <TrendingUp className="h-3.5 w-3.5" />
          </ToolButton>
          <ToolButton
            active={tool === "hline"}
            onClick={() => setTool(tool === "hline" ? "none" : "hline")}
            title="Horizontal line (click a level)"
          >
            <Minus className="h-3.5 w-3.5" />
          </ToolButton>
          <ToolButton
            active={alertPrice != null}
            onClick={toggleAlert}
            title={alertPrice != null ? "Remove price alert" : "Add price alert (drag the line)"}
          >
            {alertPrice != null ? <BellOff className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
          </ToolButton>
          {hasDrawings && (
            <ToolButton active={false} onClick={clearDrawings} title="Clear drawings">
              <Trash2 className="h-3.5 w-3.5" />
            </ToolButton>
          )}
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
        <div className="ml-auto flex items-center gap-4">
          {extendedApplies && (
            <label className="flex items-center gap-1.5 text-xs text-muted cursor-pointer">
              <input
                type="checkbox"
                checked={showExtended}
                onChange={(e) => setShowExtended(e.target.checked)}
                className="h-3.5 w-3.5 accent-[var(--accent)]"
              />
              Extended hours
            </label>
          )}
          {hasGann && (
            <label className="flex items-center gap-1.5 text-xs text-muted cursor-pointer">
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
      </div>

      {/* Indicator toggles */}
      <div className="flex flex-wrap items-center gap-1.5">
        {(Object.keys(OVERLAY_META) as Overlay[]).map((k) => (
          <IndicatorChip
            key={k}
            label={OVERLAY_META[k].label}
            color={OVERLAY_META[k].color}
            active={overlays.has(k)}
            onClick={() => toggleSet(overlays, setOverlays, k)}
          />
        ))}
        {(Object.keys(STUDY_META) as Study[]).map((k) => (
          <IndicatorChip
            key={k}
            label={STUDY_META[k].label}
            active={studies.has(k)}
            onClick={() => toggleSet(studies, setStudies, k)}
          />
        ))}
      </div>

      {/* Contextual hint while a drawing tool is armed. */}
      {tool !== "none" && (
        <div className="text-xs text-accent">
          {tool === "hline"
            ? "Click a price level to drop a horizontal line."
            : pending
              ? "Click the second point to finish the trend line."
              : "Click the first point of the trend line."}
        </div>
      )}
      {alertHit && (
        <div className="flex items-center gap-2 rounded-md bg-warn/10 px-2.5 py-1 text-xs text-warn">
          <Bell className="h-3.5 w-3.5" /> {alertHit}
          <button className="ml-auto cursor-pointer underline" onClick={() => setAlertHit(null)}>
            dismiss
          </button>
        </div>
      )}

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
        {extendedApplies && <LegendItem color="rgba(5,150,105,0.40)" label="Extended-hours candles (dimmed)" solidBlock />}
        {alertPrice != null && <LegendItem color={ALERT_COLOR} dashed label="Price alert (drag to move)" />}
        {hasDrawings && <LegendItem color={DRAW_COLOR} label="Your drawings" />}
        <span className="text-muted/80">
          {crypto
            ? "Crypto: live, up-to-the-second."
            : "Stocks: bars are ~15 min delayed on the free data feed; last price ticks live."}
        </span>
      </div>
    </div>
  );
}

function ToolButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-md cursor-pointer transition-colors",
        active ? "bg-accent-soft text-accent" : "text-muted hover:text-foreground hover:bg-border/50",
      )}
    >
      {children}
    </button>
  );
}

function IndicatorChip({
  label,
  color,
  active,
  onClick,
}: {
  label: string;
  color?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium cursor-pointer transition-colors",
        active ? "border-accent bg-accent-soft text-accent" : "border-border text-muted hover:text-foreground",
      )}
    >
      {color && <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />}
      {label}
    </button>
  );
}

function LegendItem({
  color,
  label,
  dashed,
  solidBlock,
}: {
  color: string;
  label: string;
  dashed?: boolean;
  solidBlock?: boolean;
}) {
  return (
    <span className="flex items-center gap-1.5">
      {solidBlock ? (
        <span className="inline-block h-3 w-3 rounded-sm" style={{ background: color }} />
      ) : (
        <span
          className="inline-block h-0 w-4"
          style={{ borderTop: `2px ${dashed ? "dashed" : "solid"} ${color}` }}
        />
      )}
      {label}
    </span>
  );
}

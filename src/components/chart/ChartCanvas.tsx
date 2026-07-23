"use client";

import { useMemo, useRef, useState } from "react";
import type { OHLCVBar, Interval } from "@/lib/marketData/types";
import { macd as computeMacd, rsiSeries } from "@/lib/analysis/series";
import { classifySession } from "@/lib/candles/sessions";
import { palette } from "@/config/theme";

// ViewBox geometry (scales to container width via width:100%).
const W = 820;
const H = 900;
const PLOT_LEFT = 6;
const PLOT_RIGHT = 752; // right gutter holds price-axis labels
const PLOT_W = PLOT_RIGHT - PLOT_LEFT;

const PRICE_TOP = 18;
const PRICE_BOTTOM = 452;
const VOL_H = 84; // volume band height at base of price pane

const MACD_TOP = 486;
const MACD_BOTTOM = 604;
const RSI_TOP = 634;
const RSI_BOTTOM = 752;
const XAXIS_Y = 770;

const UP = palette.bull.base;
const DOWN = palette.bear.base;
const GRID = "#1c2028";
const AXIS_TEXT = "#6b7280";

function fmtVol(v: number): string {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
  if (v >= 1_000) return (v / 1_000).toFixed(1) + "K";
  return String(v);
}

function makeTimeFmt(interval: Interval): (ms: number) => string {
  const intraday = /m|h/.test(interval) && interval !== "1M";
  const opts: Intl.DateTimeFormatOptions = intraday
    ? { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false }
    : interval === "1M" || interval === "1w"
      ? { timeZone: "America/New_York", month: "short", year: "2-digit" }
      : { timeZone: "America/New_York", month: "numeric", day: "numeric" };
  const f = new Intl.DateTimeFormat("en-US", opts);
  return (ms: number) => f.format(new Date(ms));
}

export function ChartCanvas({
  bars,
  interval,
  extended,
}: {
  bars: OHLCVBar[];
  interval: Interval;
  extended: boolean;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const model = useMemo(() => {
    const n = bars.length;
    const closes = bars.map((b) => b.close);
    const highs = bars.map((b) => b.high);
    const lows = bars.map((b) => b.low);
    const vols = bars.map((b) => b.volume);
    const priceMax = Math.max(...highs);
    const priceMin = Math.min(...lows);
    const pad = (priceMax - priceMin) * 0.06 || 1;
    const pMax = priceMax + pad;
    const pMin = priceMin - pad;
    const vMax = Math.max(...vols, 1);

    const step = n > 0 ? PLOT_W / n : PLOT_W;
    const bodyW = Math.max(1, Math.min(step * 0.7, 14));

    const x = (i: number) => PLOT_LEFT + (i + 0.5) * step;
    const yPrice = (p: number) =>
      PRICE_TOP + ((pMax - p) / (pMax - pMin)) * (PRICE_BOTTOM - PRICE_TOP);
    const yVol = (v: number) => PRICE_BOTTOM - (v / vMax) * VOL_H;

    const m = computeMacd(closes);
    const rsi = rsiSeries(closes);
    const mAbs =
      Math.max(
        ...m.macd.map((v) => Math.abs(v ?? 0)),
        ...m.signal.map((v) => Math.abs(v ?? 0)),
        ...m.histogram.map((v) => Math.abs(v ?? 0)),
        0.0001
      ) || 1;
    const macdMid = (MACD_TOP + MACD_BOTTOM) / 2;
    const yMacd = (v: number) => macdMid - (v / mAbs) * ((MACD_BOTTOM - MACD_TOP) / 2);
    const yRsi = (v: number) => RSI_TOP + ((100 - v) / 100) * (RSI_BOTTOM - RSI_TOP);

    return { n, step, bodyW, x, yPrice, yVol, pMax, pMin, m, rsi, yMacd, yRsi, closes };
  }, [bars]);

  const timeFmt = useMemo(() => makeTimeFmt(interval), [interval]);

  if (bars.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-[#6b7280]">
        No data for this timeframe.
      </div>
    );
  }

  const { n, step, bodyW, x, yPrice, yVol, pMax, pMin, m, rsi, yMacd, yRsi } = model;

  const onMove = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const vx = ((clientX - rect.left) / rect.width) * W;
    const i = Math.round((vx - PLOT_LEFT) / step - 0.5);
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  // Price-axis gridlines/labels.
  const priceTicks = Array.from({ length: 6 }, (_, k) => pMin + ((pMax - pMin) * k) / 5);
  // X-axis time labels.
  const xLabelIdx = Array.from({ length: Math.min(5, n) }, (_, k) =>
    Math.floor((k * (n - 1)) / Math.max(1, Math.min(5, n) - 1))
  );

  const hb = hover != null ? bars[hover] : null;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      className="w-full touch-none select-none"
      onMouseMove={(e) => onMove(e.clientX)}
      onMouseLeave={() => setHover(null)}
      onTouchStart={(e) => onMove(e.touches[0].clientX)}
      onTouchMove={(e) => onMove(e.touches[0].clientX)}
    >
      {/* Price gridlines + right-axis labels */}
      {priceTicks.map((p, k) => (
        <g key={`pg${k}`}>
          <line x1={PLOT_LEFT} x2={PLOT_RIGHT} y1={yPrice(p)} y2={yPrice(p)} stroke={GRID} strokeWidth={1} />
          <text x={PLOT_RIGHT + 6} y={yPrice(p) + 4} fill={AXIS_TEXT} fontSize={13}>
            {p.toFixed(2)}
          </text>
        </g>
      ))}

      {/* ETH session shading (extended timeframes only) */}
      {extended &&
        bars.map((b, i) =>
          classifySession(b.timestamp) !== "RTH" ? (
            <rect
              key={`eth${i}`}
              x={x(i) - step / 2}
              y={PRICE_TOP}
              width={step}
              height={PRICE_BOTTOM - PRICE_TOP}
              fill="#ffffff"
              opacity={0.04}
            />
          ) : null
        )}

      {/* Volume */}
      {bars.map((b, i) => (
        <rect
          key={`v${i}`}
          x={x(i) - bodyW / 2}
          y={yVol(b.volume)}
          width={bodyW}
          height={PRICE_BOTTOM - yVol(b.volume)}
          fill={b.close >= b.open ? UP : DOWN}
          opacity={0.18}
        />
      ))}

      {/* Candles */}
      {bars.map((b, i) => {
        const up = b.close >= b.open;
        const color = up ? UP : DOWN;
        const yO = yPrice(b.open);
        const yC = yPrice(b.close);
        const top = Math.min(yO, yC);
        const hgt = Math.max(1, Math.abs(yC - yO));
        return (
          <g key={`c${i}`}>
            <line x1={x(i)} x2={x(i)} y1={yPrice(b.high)} y2={yPrice(b.low)} stroke={color} strokeWidth={1} />
            <rect x={x(i) - bodyW / 2} y={top} width={bodyW} height={hgt} fill={color} />
          </g>
        );
      })}

      {/* Pane labels */}
      <text x={PLOT_LEFT} y={MACD_TOP - 6} fill={AXIS_TEXT} fontSize={13}>MACD</text>
      <text x={PLOT_LEFT} y={RSI_TOP - 6} fill={AXIS_TEXT} fontSize={13}>RSI</text>

      {/* MACD zero line + histogram + lines */}
      <line x1={PLOT_LEFT} x2={PLOT_RIGHT} y1={yMacd(0)} y2={yMacd(0)} stroke={GRID} />
      {m.histogram.map((v, i) =>
        v == null ? null : (
          <rect
            key={`mh${i}`}
            x={x(i) - bodyW / 2}
            y={Math.min(yMacd(0), yMacd(v))}
            width={bodyW}
            height={Math.max(1, Math.abs(yMacd(v) - yMacd(0)))}
            fill={v >= 0 ? UP : DOWN}
            opacity={0.8}
          />
        )
      )}
      <Polyline points={m.macd.map((v, i) => (v == null ? null : [x(i), yMacd(v)]))} stroke={UP} />
      <Polyline points={m.signal.map((v, i) => (v == null ? null : [x(i), yMacd(v)]))} stroke="#9b6dff" />

      {/* RSI bands + line */}
      {[70, 50, 30].map((lvl) => (
        <line
          key={`r${lvl}`}
          x1={PLOT_LEFT}
          x2={PLOT_RIGHT}
          y1={yRsi(lvl)}
          y2={yRsi(lvl)}
          stroke={lvl === 50 ? GRID : "#3a2a5a"}
          strokeDasharray={lvl === 50 ? "" : "3 3"}
        />
      ))}
      <text x={PLOT_RIGHT + 6} y={yRsi(70) + 4} fill={AXIS_TEXT} fontSize={12}>70</text>
      <text x={PLOT_RIGHT + 6} y={yRsi(30) + 4} fill={AXIS_TEXT} fontSize={12}>30</text>
      <Polyline points={rsi.map((v, i) => (v == null ? null : [x(i), yRsi(v)]))} stroke="#e05fd6" />

      {/* X-axis time labels */}
      {xLabelIdx.map((i, k) => (
        <text
          key={`x${k}`}
          x={Math.max(14, Math.min(PLOT_RIGHT - 14, x(i)))}
          y={XAXIS_Y}
          fill={AXIS_TEXT}
          fontSize={12}
          textAnchor="middle"
        >
          {timeFmt(bars[i].timestamp)}
        </text>
      ))}

      {/* Crosshair + OHLCV tooltip */}
      {hover != null && hb && (
        <g>
          <line x1={x(hover)} x2={x(hover)} y1={PRICE_TOP} y2={RSI_BOTTOM} stroke="#8b93a1" strokeWidth={1} strokeDasharray="4 4" />
          <line x1={PLOT_LEFT} x2={PLOT_RIGHT} y1={yPrice(hb.close)} y2={yPrice(hb.close)} stroke="#8b93a1" strokeWidth={1} strokeDasharray="4 4" />
          <rect x={x(hover) - 22} y={XAXIS_Y - 12} width={44} height={16} rx={3} fill="#e6e8eb" />
          <text x={x(hover)} y={XAXIS_Y} fill="#0d0f12" fontSize={11} textAnchor="middle">
            {timeFmt(hb.timestamp)}
          </text>
          <OhlcvTooltip bar={hb} />
        </g>
      )}
    </svg>
  );
}

function OhlcvTooltip({ bar }: { bar: OHLCVBar }) {
  const rows: Array<[string, string]> = [
    ["Open", bar.open.toFixed(2)],
    ["High", bar.high.toFixed(2)],
    ["Low", bar.low.toFixed(2)],
    ["Close", bar.close.toFixed(2)],
    ["Range", (bar.high - bar.low).toFixed(2)],
    ["Volume", fmtVol(bar.volume)],
  ];
  return (
    <g>
      {rows.map(([k, v], i) => (
        <text key={k} x={PLOT_LEFT + 8} y={PRICE_TOP + 20 + i * 18} fontSize={14} fill="#e6e8eb">
          <tspan fill="#8b93a1">{k.padEnd(7)}</tspan>
          <tspan dx={6}>{v}</tspan>
        </text>
      ))}
    </g>
  );
}

/** Draws a polyline over a sparse array of [x,y] points (nulls break the line). */
function Polyline({
  points,
  stroke,
}: {
  points: Array<[number, number] | null>;
  stroke: string;
}) {
  let d = "";
  let pen = false;
  for (const pt of points) {
    if (pt == null) {
      pen = false;
      continue;
    }
    d += `${pen ? "L" : "M"}${pt[0].toFixed(1)} ${pt[1].toFixed(1)} `;
    pen = true;
  }
  return <path d={d} fill="none" stroke={stroke} strokeWidth={1.5} />;
}

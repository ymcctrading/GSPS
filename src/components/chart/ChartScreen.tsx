"use client";

import { useEffect, useMemo, useState } from "react";
import type { OHLCVBar, Quote } from "@/lib/marketData/types";
import { timeframeById, DEFAULT_TIMEFRAME_ID } from "@/config/timeframes";
import { ChartCanvas } from "./ChartCanvas";
import { TimeframeMenu } from "./TimeframeMenu";

/** How many of the most recent bars to render (keeps the SVG light + readable). */
const DISPLAY_BARS = 150;

interface CandleResponse {
  bars: OHLCVBar[];
}

export function ChartScreen({
  symbol = "SPY",
  name = "State Street SPDR S&P 500…",
}: {
  symbol?: string;
  name?: string;
}) {
  const [tfId, setTfId] = useState(DEFAULT_TIMEFRAME_ID);
  const [bars, setBars] = useState<OHLCVBar[]>([]);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);

  const tf = timeframeById(tfId);

  useEffect(() => {
    fetch(`/api/quote?ticker=${symbol}`)
      .then((r) => r.json())
      .then(setQuote)
      .catch(() => {});
  }, [symbol]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const url = `/api/candles?ticker=${symbol}&interval=${tf.interval}&includeExtendedHours=${tf.extended}`;
    fetch(url)
      .then((r) => r.json())
      .then((json: CandleResponse) => {
        if (alive) setBars(json.bars ?? []);
      })
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [symbol, tf.interval, tf.extended]);

  const shown = useMemo(() => bars.slice(-DISPLAY_BARS), [bars]);

  const last = quote?.last ?? shown[shown.length - 1]?.close ?? 0;
  const change = quote?.change ?? 0;
  const changePct = quote?.changePct ?? 0;
  const up = change >= 0;
  const impliedMove = (last * 0.004).toFixed(3);
  // Synthetic bid/ask around last (mock; a real feed would supply Level I).
  const bid = (last + 0.03).toFixed(2);
  const ask = (last + 0.05).toFixed(2);

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-canvas">
      {/* Header */}
      <header className="flex items-center justify-between px-4 pt-3">
        <div className="flex items-center gap-2">
          <a href="/" className="text-xl text-[#8b93a1]">‹</a>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold">{symbol}</span>
              <span className="rounded-full bg-purple-500/80 px-1.5 text-[10px] font-semibold">24</span>
              <span className="text-accent">🔔</span>
            </div>
            <div className="max-w-[200px] truncate text-xs text-[#8b93a1]">{name}</div>
          </div>
        </div>
        <div className="flex items-center gap-3 text-[#8b93a1]">
          <span>⌖</span>
          <span>🔍</span>
        </div>
      </header>

      {/* Price bar + bid/ask */}
      <div className="flex items-start justify-between px-4 pt-3">
        <div>
          <div className="text-4xl font-semibold tabular-nums">{last.toFixed(2)}</div>
          <div className={`text-sm ${up ? "text-bull" : "text-bear"}`}>
            {up ? "+" : ""}
            {change.toFixed(2)} ({up ? "+" : ""}
            {changePct.toFixed(2)}%)
          </div>
          <div className="mt-0.5 text-xs">
            <span className="font-bold text-accent">MMM</span>{" "}
            <span className="text-[#8b93a1]">±{impliedMove}</span>
          </div>
        </div>
        <div className="flex gap-1.5">
          <ExecBlock label="Sell" price={bid} sizeLabel="Bid Size" size={92} tone="bear" up={up} />
          <ExecBlock label="Buy" price={ask} sizeLabel="Ask Size" size={580} tone="bull" up={up} />
        </div>
      </div>

      {/* Tabs */}
      <nav className="mt-3 flex items-center gap-6 border-b border-[#1c2028] px-4 text-sm">
        <Tab label="Chart" active />
        <Tab label="Research" />
        <Tab label="Options" />
        <Tab label="Level II" />
      </nav>

      {/* Timeframe selector */}
      <div className="relative px-4 py-2">
        <button
          onClick={() => setPickerOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 text-sm"
        >
          <span className="flex h-4 w-4 items-center justify-center rounded-full border border-[#3a3f4a] text-[10px] text-[#8b93a1]">T</span>
          <span className="border-b border-dotted border-[#8b93a1]">{tf.selectorLabel}</span>
        </button>
        {pickerOpen && (
          <TimeframeMenu
            activeId={tfId}
            onPick={(id) => {
              setTfId(id);
              setPickerOpen(false);
            }}
            onClose={() => setPickerOpen(false)}
          />
        )}
      </div>

      {/* Chart */}
      <div className="flex-1 px-1">
        {loading && shown.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-sm text-[#6b7280]">
            Loading {tf.selectorLabel}…
          </div>
        ) : (
          <ChartCanvas bars={shown} interval={tf.interval} extended={tf.extended} />
        )}
      </div>

      {/* Bottom nav */}
      <nav className="sticky bottom-0 grid grid-cols-5 border-t border-[#1c2028] bg-canvas/95 py-2 text-center text-[10px] text-[#8b93a1] backdrop-blur">
        {["Overview", "Watchlist", "Trade", "Positions", "More"].map((n) => (
          <div key={n} className={n === "Watchlist" ? "text-accent" : ""}>
            <div className="text-base leading-none">{navGlyph(n)}</div>
            <div className="mt-1">{n}</div>
          </div>
        ))}
      </nav>
    </div>
  );
}

function ExecBlock({
  label,
  price,
  sizeLabel,
  size,
  tone,
  up,
}: {
  label: string;
  price: string;
  sizeLabel: string;
  size: number;
  tone: "bull" | "bear";
  up: boolean;
}) {
  const headerBg = tone === "bear" ? "bg-bear-bg" : "bg-bull-bg";
  const headerText = tone === "bear" ? "text-bear-soft" : "text-bull-soft";
  const priceColor = up ? "text-bull" : "text-bear";
  return (
    <div className={`w-24 rounded-md border border-[#20252f] ${headerBg}`}>
      <div className={`rounded-t-md px-2 py-0.5 text-center text-xs font-semibold ${headerText}`}>{label}</div>
      <div className="px-2 py-1 text-center">
        <div className={`text-lg font-semibold tabular-nums ${priceColor}`}>{price}</div>
        <div className="text-[10px] text-[#8b93a1]">
          {sizeLabel}: {size}
        </div>
      </div>
    </div>
  );
}

function Tab({ label, active = false }: { label: string; active?: boolean }) {
  return (
    <button
      className={`-mb-px border-b-2 pb-2 pt-1 ${
        active ? "border-[#3aa0ff] font-medium text-white" : "border-transparent text-[#8b93a1]"
      }`}
    >
      {label}
    </button>
  );
}

function navGlyph(n: string): string {
  switch (n) {
    case "Overview":
      return "▦";
    case "Watchlist":
      return "★";
    case "Trade":
      return "⇄";
    case "Positions":
      return "💼";
    default:
      return "•••";
  }
}

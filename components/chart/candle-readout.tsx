"use client";

import { useMemo } from "react";
import type { CandleReadout } from "@/lib/chart/readout";
import { formatPrice, formatVolume, priceDigits } from "@/lib/chart/readout";
import { cn } from "@/lib/utils";

/**
 * The per-candle stat panel that reports whichever bar the crosshair is on,
 * falling back to the most recent bar when the pointer is off the chart.
 *
 * Docked to a corner of the price pane rather than floating on the crosshair:
 * a panel that chases the pointer covers the candles either side of the one it
 * describes, which is exactly the context you are reading it against. Docked,
 * it also survives a phone, where there is no hover and the panel would
 * otherwise sit under the thumb.
 *
 * Layout is a 2×2 price grid over two measure rows — a range strip showing where
 * the body and close sit inside the bar's high/low, and volume against its own
 * trailing average — so the shape of the candle is legible without counting
 * decimals.
 *
 * The grid reads open, close, high, low: the two prices that decide whether the
 * bar went up or down sit on the first line, and the two that describe how far
 * it stretched getting there sit on the second. Conventional OHLC order splits
 * that pair across both lines, so the comparison a reader makes first is the
 * one the layout makes hardest.
 *
 * The whole panel is optional — see the Candle stats switch in the chart
 * toolbar. It sits over the price pane, and a reader who wants the candles
 * underneath it should be able to have them.
 */
export function CandleReadoutPanel({
  readout,
  timeframeLabel,
  live,
  className,
}: {
  readout: CandleReadout | null;
  /** Short timeframe tag, e.g. "D" or "15m". */
  timeframeLabel: string;
  /** True while the panel is describing the still-forming last bar. */
  live?: boolean;
  className?: string;
}) {
  const stamp = useMemo(
    () => (readout ? formatStamp(readout.time, timeframeLabel) : ""),
    [readout, timeframeLabel],
  );

  if (!readout) return null;

  const { direction, open, high, low, close, range, bodyShare, changePct, relVolume } = readout;
  const digits = priceDigits(close);
  const tone =
    direction === "up" ? "text-bull" : direction === "down" ? "text-bear" : "text-muted";
  const rail =
    direction === "up"
      ? "var(--bull)"
      : direction === "down"
        ? "var(--bear)"
        : "var(--muted)";

  return (
    <div
      className={cn(
        "pointer-events-none max-w-[15rem] overflow-hidden rounded-lg border border-border/80",
        "bg-surface/85 text-[11px] shadow-sm backdrop-blur-sm",
        className,
      )}
      // The direction rail. A tinted edge reads at a glance from across the
      // screen, where a coloured number does not.
      style={{ borderLeft: `3px solid ${rail}` }}
      role="status"
      aria-live="off"
      aria-label="Selected candle statistics"
    >
      <div className="flex items-center gap-2 border-b border-border/60 px-2 py-1">
        <span className="truncate font-medium text-muted">{stamp}</span>
        {readout.extended && (
          <span className="shrink-0 rounded bg-warn-soft px-1 text-[9px] font-semibold uppercase tracking-wide text-warn">
            Ext
          </span>
        )}
        {live && (
          <span className="shrink-0 rounded bg-accent-soft px-1 text-[9px] font-semibold uppercase tracking-wide text-accent">
            Live
          </span>
        )}
        <span className={cn("ml-auto shrink-0 font-mono font-semibold tabular-nums", tone)}>
          {direction === "up" ? "▲" : direction === "down" ? "▼" : "■"}{" "}
          {changePct >= 0 ? "+" : ""}
          {changePct.toFixed(2)}%
        </span>
      </div>

      {/* Open/close on the top line, high/low beneath — see the note above. */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 px-2 py-1.5">
        <Field label="O" value={formatPrice(open, digits)} />
        <Field label="C" value={formatPrice(close, digits)} tone={tone} />
        <Field label="H" value={formatPrice(high, digits)} />
        <Field label="L" value={formatPrice(low, digits)} />
      </div>

      <div className="space-y-1.5 border-t border-border/60 px-2 py-1.5">
        <Measure
          label="Range"
          value={formatPrice(range, digits)}
          note={`body ${Math.round(bodyShare * 100)}%`}
        >
          <RangeStrip readout={readout} tint={rail} />
        </Measure>

        <Measure
          label="Vol"
          value={formatVolume(readout.volume)}
          note={relVolume == null ? "—" : `${relVolume.toFixed(1)}× avg`}
        >
          <VolumeMeter relVolume={relVolume} tint={rail} />
        </Measure>
      </div>
    </div>
  );
}

function Field({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="w-2 shrink-0 font-mono text-[10px] font-semibold uppercase text-muted">
        {label}
      </span>
      <span className={cn("font-mono tabular-nums text-foreground", tone)}>{value}</span>
    </div>
  );
}

function Measure({
  label,
  value,
  note,
  children,
}: {
  label: string;
  value: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-[9px] font-semibold uppercase tracking-wide text-muted">{label}</span>
        <span className="font-mono tabular-nums text-foreground">{value}</span>
        <span className="ml-auto font-mono text-[10px] tabular-nums text-muted">{note}</span>
      </div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

/**
 * The bar's low→high span as a track, with the open→close body drawn inside it
 * and a notch where the close landed. It answers "long upper wick, close on the
 * lows" without the reader differencing four numbers in their head.
 */
function RangeStrip({ readout, tint }: { readout: CandleReadout; tint: string }) {
  const { low, open, close, range, closePosition } = readout;
  const pos = (price: number) => (range === 0 ? 50 : ((price - low) / range) * 100);
  const bodyLeft = Math.min(pos(open), pos(close));
  const bodyWidth = Math.max(Math.abs(pos(close) - pos(open)), 1.5); // a doji still shows
  // The readout already located the close inside the range, zero-range bars
  // included — recomputing it here would be a second definition to keep in step.
  const closeAt = closePosition * 100;

  return (
    <div className="relative h-2 w-full rounded-sm bg-border/60">
      <div
        className="absolute inset-y-0 rounded-sm opacity-70"
        style={{ left: `${bodyLeft}%`, width: `${bodyWidth}%`, background: tint }}
      />
      <div
        className="absolute inset-y-[-2px] w-[2px] rounded-full bg-foreground"
        style={{ left: `calc(${closeAt}% - 1px)` }}
      />
    </div>
  );
}

/** Volume against its trailing average, clipped at 3× — past that it is "huge". */
function VolumeMeter({ relVolume, tint }: { relVolume: number | null; tint: string }) {
  const filled = relVolume == null ? 0 : Math.min(relVolume / 3, 1) * 100;
  return (
    <div className="relative h-2 w-full rounded-sm bg-border/60">
      <div
        className="absolute inset-y-0 left-0 rounded-sm opacity-70"
        style={{ width: `${filled}%`, background: tint }}
      />
      {/* The 1× mark — the line a bar has to clear to count as participation. */}
      <div className="absolute inset-y-0 left-1/3 w-px bg-foreground/40" />
    </div>
  );
}

/**
 * Date stamp scaled to the timeframe: an intraday candle needs its clock time,
 * a daily one does not, and a monthly one does not need its day.
 */
function formatStamp(timeSec: number, timeframeLabel: string): string {
  const d = new Date(timeSec * 1000);
  const intraday = /m|H/.test(timeframeLabel) && timeframeLabel !== "M";
  const date = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: intraday ? undefined : "numeric",
  });
  if (!intraday) return `${date} · ${timeframeLabel}`;
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${date} ${time} · ${timeframeLabel}`;
}

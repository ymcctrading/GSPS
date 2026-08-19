/**
 * GSPS — the pictures in the first-run tour.
 *
 * Each figure renders one slice of the frozen SPY snapshot in the app's own
 * visual language, so a reader who has just been shown "this is what a score
 * badge looks like" recognises the real one when they meet it. They are
 * deliberately *small* renderings rather than embedded copies of the real
 * screens: a beginner reading a tour step needs the one element the sentence is
 * about, and dropping a full Portfolio table beside a caption buries it.
 *
 * ## The label is not optional
 *
 * Everything here is old data dressed in live-looking UI, which is exactly the
 * shape of an honest mistake — a reader glancing at a green number and thinking
 * they own something. So the frame, not the individual figures, owns the
 * disclosure: every figure goes through `SnapshotFrame`, and the frame always
 * draws the badge. There is no prop to turn it off, because the only reason to
 * add one would be to use it.
 *
 * `snapshot-figure.test.tsx` asserts that, across every figure the tour uses.
 */

import { formatUsd, cn } from "@/lib/utils";
import type { TourFigure } from "@/lib/onboarding/tour";
import {
  SNAPSHOT_BACKTEST,
  SNAPSHOT_BADGE,
  SNAPSHOT_BARS,
  SNAPSHOT_CAPS,
  SNAPSHOT_EXIT_LADDER,
  SNAPSHOT_GUIDED,
  SNAPSHOT_LAST_CLOSE,
  SNAPSHOT_NOTICE,
  SNAPSHOT_PLAN,
  SNAPSHOT_POSITION,
  SNAPSHOT_SYMBOL,
} from "@/lib/onboarding/spy-snapshot";

/**
 * The frame every figure sits in.
 *
 * The badge is `aria-hidden` and the full sentence is the screen-reader text:
 * "Saved example · not live" is a fine glance-able marker but a poor thing to
 * hear read aloud with no context, and a reader who cannot see the visual
 * treatment needs the whole disclosure rather than the abbreviation of it.
 */
function SnapshotFrame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <figure className="min-w-0 rounded-xl border border-dashed border-warn/50 bg-warn-soft/40 p-3">
      <figcaption className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span
          aria-hidden="true"
          className="rounded-full bg-warn/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-warn"
        >
          {SNAPSHOT_BADGE}
        </span>
        <span className="text-xs font-medium text-muted">{label}</span>
        <span className="sr-only">{SNAPSHOT_NOTICE}</span>
      </figcaption>
      <div className="min-w-0 rounded-lg border border-border bg-surface p-3">{children}</div>
    </figure>
  );
}

/** The full disclosure in visible text, for surfaces that show it once up top. */
export function SnapshotDisclosure({ className }: { className?: string }) {
  return (
    <p className={cn("rounded-lg border border-warn/40 bg-warn-soft px-3 py-2 text-sm text-foreground", className)}>
      {SNAPSHOT_NOTICE}
    </p>
  );
}

export function SnapshotFigure({ figure }: { figure: TourFigure }) {
  switch (figure) {
    case "none":
      return null;
    case "chart":
      return (
        <SnapshotFrame label={`${SNAPSHOT_SYMBOL} — the last 30 days`}>
          <CandleChart />
        </SnapshotFrame>
      );
    case "plan":
      return (
        <SnapshotFrame label={`${SNAPSHOT_SYMBOL} — the four prices in a trade plan`}>
          <PlanLevels />
        </SnapshotFrame>
      );
    case "scan":
      return (
        <SnapshotFrame label="A row in a scan result">
          <ScanRow />
        </SnapshotFrame>
      );
    case "guided":
      return (
        <SnapshotFrame label="A Guided suggestion">
          <GuidedPreview />
        </SnapshotFrame>
      );
    case "exits":
      return (
        <SnapshotFrame label="How the 36 shares would be sold">
          <ExitLadder />
        </SnapshotFrame>
      );
    case "position":
      return (
        <SnapshotFrame label="An open position in your Portfolio">
          <PositionRow />
        </SnapshotFrame>
      );
    case "backtest":
      return (
        <SnapshotFrame label="A Backtest summary">
          <BacktestStats />
        </SnapshotFrame>
      );
    case "caps":
      return (
        <SnapshotFrame label="The safety limits, as shipped">
          <CapsList />
        </SnapshotFrame>
      );
  }
}

/**
 * Thirty daily candles as inline SVG.
 *
 * Inline rather than the app's charting library on purpose: this is a static
 * picture of thirty fixed numbers, and pulling in a live-updating chart engine
 * to draw it would add a canvas, a resize observer and a mount cost to what is
 * ultimately an illustration. `preserveAspectRatio="none"` is deliberately not
 * used — squashing candles distorts the one thing the figure is teaching.
 */
function CandleChart() {
  const W = 320;
  const H = 132;
  const PAD = 6;
  const lows = SNAPSHOT_BARS.map((b) => b.low);
  const highs = SNAPSHOT_BARS.map((b) => b.high);
  const min = Math.min(...lows);
  const max = Math.max(...highs);
  const span = max - min || 1;
  const y = (price: number) => PAD + ((max - price) / span) * (H - PAD * 2);
  const slot = W / SNAPSHOT_BARS.length;
  const bodyW = Math.max(2, slot * 0.6);

  return (
    <div className="min-w-0">
      {/*
        Capped and centred rather than stretched across the card. The default
        `preserveAspectRatio` scales the drawing to fit the *height* and centres
        the result, so a full-width svg on a wide screen renders a small chart
        floating in a large empty box. Constraining the width instead keeps the
        candles proportional at every size, from the 360px overlay card up.
      */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mx-auto block h-auto w-full max-w-md"
        role="img"
        aria-label={`Saved example: ${SNAPSHOT_SYMBOL} daily prices over 30 days, rising to about ${formatUsd(max, 0)} then easing back to close at ${formatUsd(SNAPSHOT_LAST_CLOSE)}. Not live data.`}
      >
        {SNAPSHOT_BARS.map((bar, i) => {
          const cx = i * slot + slot / 2;
          const up = bar.close >= bar.open;
          const top = y(Math.max(bar.open, bar.close));
          const bottom = y(Math.min(bar.open, bar.close));
          return (
            <g key={bar.date} className={up ? "text-bull" : "text-bear"}>
              <line
                x1={cx}
                x2={cx}
                y1={y(bar.high)}
                y2={y(bar.low)}
                stroke="currentColor"
                strokeWidth={1}
              />
              <rect
                x={cx - bodyW / 2}
                y={top}
                width={bodyW}
                height={Math.max(1, bottom - top)}
                fill="currentColor"
              />
            </g>
          );
        })}
      </svg>
      <p className="mt-1 text-xs text-muted">
        Closed at <span className="font-mono text-foreground">{formatUsd(SNAPSHOT_LAST_CLOSE)}</span>. Green days
        finished higher than they started, red days finished lower.
      </p>
    </div>
  );
}

/** The four plan prices, in the colours the chart page draws them in. */
function PlanLevels() {
  const rows = [
    { label: "Entry", value: SNAPSHOT_PLAN.entry, tone: "accent", plain: "where the trade starts" },
    { label: "Stop loss", value: SNAPSHOT_PLAN.stopLoss, tone: "bear", plain: "where you get out if it goes wrong" },
    { label: "First target", value: SNAPSHOT_PLAN.takeProfit1, tone: "bull", plain: "where most of it is sold" },
    { label: "Second target", value: SNAPSHOT_PLAN.masterProfit, tone: "bull", plain: "where more comes off" },
  ] as const;

  return (
    <dl className="flex flex-col gap-2">
      {rows.map((r) => (
        <div key={r.label} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <dt className="text-sm font-medium">
            <span
              aria-hidden="true"
              className={cn(
                "mr-2 inline-block h-2 w-4 rounded-full align-middle",
                r.tone === "accent" && "bg-accent",
                r.tone === "bear" && "bg-bear",
                r.tone === "bull" && "bg-bull",
              )}
            />
            {r.label}
          </dt>
          <dd className="flex items-baseline gap-2">
            <span className="text-xs text-muted">{r.plain}</span>
            <span
              className={cn(
                "font-mono text-sm",
                r.tone === "accent" && "text-accent",
                r.tone === "bear" && "text-bear",
                r.tone === "bull" && "text-bull",
              )}
            >
              {formatUsd(r.value)}
            </span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** One scan result, carrying the score and the one-word verdict. */
function ScanRow() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <p className="font-semibold">{SNAPSHOT_SYMBOL}</p>
        <p className="font-mono text-xs text-muted">{formatUsd(SNAPSHOT_LAST_CLOSE)}</p>
      </div>
      <div className="flex items-center gap-2">
        <span className="rounded-lg border border-border bg-background px-2 py-1 font-mono text-sm">
          {SNAPSHOT_GUIDED.scoreOutOf9}/9
        </span>
        <span className="rounded-full bg-bull/10 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-bull">
          {SNAPSHOT_GUIDED.verdict}
        </span>
      </div>
    </div>
  );
}

/**
 * A Guided suggestion, in the same order the real card puts things: what to do,
 * how much, what it costs if it fails. The real card's button is rendered here
 * as inert text rather than a disabled `<button>` — a disabled control in a
 * tutorial reads as "this is broken" rather than "this is a picture".
 */
function GuidedPreview() {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span className="font-semibold">{SNAPSHOT_SYMBOL}</span>
          <span className="font-mono text-xs text-muted">{formatUsd(SNAPSHOT_LAST_CLOSE)}</span>
        </div>
        <span className="rounded-full bg-bull/10 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-bull">
          Buy
        </span>
      </div>
      <p className="text-sm leading-relaxed">{SNAPSHOT_GUIDED.reason}</p>
      <div className="rounded-lg border border-border bg-background px-3 py-2">
        <p className="text-sm">
          <span className="text-muted">Recommended size:</span>{" "}
          <span className="font-medium">{SNAPSHOT_GUIDED.qty} shares</span>{" "}
          <span className="text-muted">({formatUsd(SNAPSHOT_GUIDED.notionalUsd, 0)})</span>
        </p>
        <p className="mt-1 text-sm leading-relaxed">{SNAPSHOT_GUIDED.riskRewardSentence}</p>
      </div>
      <p
        aria-hidden="true"
        className="rounded-lg bg-accent px-4 py-2 text-center text-sm font-medium text-accent-foreground"
      >
        Buy {SNAPSHOT_GUIDED.qty} {SNAPSHOT_SYMBOL}
      </p>
      <p className="text-xs text-muted">
        In the real app this button opens a summary you have to confirm before anything is placed.
      </p>
    </div>
  );
}

/** The staged exit as share counts, which add up to the position in plain sight. */
function ExitLadder() {
  return (
    <ol className="flex flex-col gap-2">
      {SNAPSHOT_EXIT_LADDER.map((stage) => (
        <li key={stage.stage} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-sm font-medium">{stage.shares} shares</span>
          <span className="text-sm text-muted">at</span>
          <span className="text-sm font-medium">
            {stage.price === null ? "no fixed price" : formatUsd(stage.price)}
          </span>
          <span className="w-full text-xs text-muted">{stage.plain}</span>
        </li>
      ))}
      <li className="border-t border-border pt-2 text-xs text-muted">
        21 + 7 + 8 = 36, the whole position. If the stop is hit first, all 36 are sold at once and the trade is
        over.
      </li>
    </ol>
  );
}

/** An open position, with the unrealized number explained rather than shown bare. */
function PositionRow() {
  const up = SNAPSHOT_POSITION.unrealizedUsd >= 0;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="font-semibold">{SNAPSHOT_POSITION.symbol}</p>
          <p className="text-xs text-muted">
            {SNAPSHOT_POSITION.qty} shares · {SNAPSHOT_POSITION.openedAtLabel}
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-sm">{formatUsd(SNAPSHOT_POSITION.marketValue)}</p>
          <p className={cn("font-mono text-xs", up ? "text-bull" : "text-bear")}>
            {up ? "+" : ""}
            {formatUsd(SNAPSHOT_POSITION.unrealizedUsd)} ({up ? "+" : ""}
            {SNAPSHOT_POSITION.unrealizedPct.toFixed(2)}%)
          </p>
        </div>
      </div>
      <p className="text-xs text-muted">
        That green number is what you&apos;d gain if you sold right now. It changes every few seconds and it
        isn&apos;t yours until the trade is closed.
      </p>
    </div>
  );
}

/** Backtest headline numbers, with the interpretation attached. */
function BacktestStats() {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="text-xs text-muted">
        {SNAPSHOT_BACKTEST.symbolsLabel} over {SNAPSHOT_BACKTEST.window}
      </p>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Setups" value={String(SNAPSHOT_BACKTEST.trades)} />
        <Stat label="Made money" value={`${SNAPSHOT_BACKTEST.winRatePct}%`} />
        <Stat label="Avg. result" value={`${SNAPSHOT_BACKTEST.avgRMultiple.toFixed(2)}R`} />
      </div>
      <p className="text-xs text-muted">{SNAPSHOT_BACKTEST.plain}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background px-2 py-1.5">
      <p className="text-[11px] uppercase tracking-wide text-muted">{label}</p>
      <p className="font-mono text-sm">{value}</p>
    </div>
  );
}

/** The shipped caps, each with the reason it exists next to it. */
function CapsList() {
  return (
    <dl className="flex flex-col gap-2">
      {SNAPSHOT_CAPS.map((cap) => (
        <div key={cap.label}>
          <dt className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm font-medium">
            {cap.label}
            <span className="font-mono text-sm text-accent">{cap.value}</span>
          </dt>
          <dd className="text-xs text-muted">{cap.plain}</dd>
        </div>
      ))}
    </dl>
  );
}

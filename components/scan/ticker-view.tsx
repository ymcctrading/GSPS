"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CandleChart, type PriceMarker } from "@/components/chart/candles";
import { MarketTabs } from "@/components/chart/market-tabs";
import { ShareButton } from "@/components/chart/share-button";
import { SignalCard } from "@/components/scan/signal-card";
import { OrderTicket } from "@/components/trade/order-ticket";
import { GlossaryDetails } from "@/components/glossary";
import { useLiveQuote } from "@/lib/hooks/useLiveQuote";
import { sessionLabel } from "@/lib/market/session";
import { formatUsd, formatPct, cn } from "@/lib/utils";
import type { ScanResult } from "@/lib/types";
import type { LiveQuote } from "@/app/api/quote/route";

export function TickerView({ symbol }: { symbol: string }) {
  // Bumping this re-runs the scan without remounting the page.
  const [reloadKey, setReloadKey] = useState(0);
  const quote = useLiveQuote(symbol);

  /**
   * The scan is stored together with the request it answers, and read back
   * only when the two still agree. Clearing it from inside the effect instead
   * would leave one committed render — this page is reached by client-side
   * links from the dashboard, scanner and portfolio, so React reuses this
   * component rather than remounting it — where the new symbol's header sits
   * above the previous symbol's entry, stop and targets.
   */
  const [scan, setScan] = useState<{
    key: string;
    result: ScanResult | null;
    error: string | null;
    // Set when the failure is temporary (a throttled data feed), which is the
    // difference between offering a retry and calling the symbol unscannable.
    retryable: boolean;
  }>({ key: "", result: null, error: null, retryable: false });

  const scanKey = `${symbol}:${reloadKey}`;
  const current = scan.key === scanKey ? scan : null;
  const result = current?.result ?? null;
  const error = current?.error ?? null;
  const retryable = current?.retryable ?? false;

  useEffect(() => {
    let cancelled = false;
    const key = `${symbol}:${reloadKey}`;
    fetch(`/api/scan?ticker=${encodeURIComponent(symbol)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
        return res.json();
      })
      .then((data: ScanResult) => {
        if (cancelled) return;
        setScan(
          data.error
            ? {
                key,
                result: null,
                error: data.error,
                retryable: data.errorCode === "rate_limited" || data.errorCode === "upstream",
              }
            : { key, result: data, error: null, retryable: false },
        );
      })
      .catch(
        (err) =>
          !cancelled &&
          setScan({
            key,
            result: null,
            error: err instanceof Error ? err.message : String(err),
            retryable: false,
          }),
      );
    return () => {
      cancelled = true;
    };
  }, [symbol, reloadKey]);

  const markers: PriceMarker[] = [];
  if (result?.levels) {
    markers.push(
      { price: result.levels.entry, label: "Entry", kind: "entry" },
      { price: result.levels.stopLoss, label: "SL", kind: "stop" },
      { price: result.levels.takeProfit1, label: "TP1", kind: "target" },
      { price: result.levels.masterProfit, label: "MP", kind: "target" },
    );
  }
  result?.gann.fanLines.slice(0, 2).forEach((f) =>
    markers.push({ price: f.price, label: `Support ${f.angle}`, kind: "structural" }),
  );
  result?.gann.squareOf9.slice(0, 2).forEach((s) =>
    markers.push({ price: s.price, label: `Harmonic ${s.degree}°`, kind: "structural" }),
  );

  // Live price falls back to the scan snapshot until the first poll returns.
  const livePrice = quote?.price ?? (result && result.currentPrice > 0 ? result.currentPrice : null);

  const { headerRef, stuck } = useStuckHeader();

  return (
    // `min-w-0` on the column and on every grid child is what keeps a wide
    // child (the options chain, the depth ladder) scrolling inside its own box
    // instead of stretching the page — the cause of the sideways scroll and the
    // clipped header on phones.
    <div className="flex min-w-0 flex-col gap-4 sm:gap-6">
      {/*
       * The symbol and its price never leave the screen: everything below —
       * chart, ticket, research, signal — is read against them, and scrolling
       * back up to check which symbol you are looking at is the one thing this
       * page should never ask for. The bar pins directly under the app nav.
       *
       * Only the chrome changes when it pins — never the contents, the type
       * sizes or the padding. A bar that condensed on pinning would change
       * height, and since it is the first element in the flow, every pixel it
       * loses or gains yanks the whole page under the reader's eyes at the
       * exact moment they are scrolling past it.
       */}
      <div
        ref={headerRef}
        className={cn(
          // The negative margins cancel the shell's gutter so the pinned bar
          // spans the full width; the padding puts the gutter back inside it.
          "sticky top-14 z-30 -mx-3 flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 sm:-mx-4 sm:px-4 lg:-mx-6 lg:px-6",
          stuck && "border-b border-border bg-surface/90 backdrop-blur",
        )}
      >
        <h1 className="text-lg font-semibold sm:text-2xl">{symbol}</h1>
        <PriceHeader quote={quote} fallbackPrice={livePrice} />
        {/*
         * Phones keep the bar to what has to be there. The turn window is a
         * standing condition rather than a live reading, and the research tab
         * carries it on every screen size.
         */}
        {result?.gann.timeCycleActive && (
          <span className="hidden text-xs font-medium text-warn sm:inline">
            ⏱ Cyclical turn window active
          </span>
        )}
        <div className="ml-auto">
          <ShareButton symbol={symbol} />
        </div>
      </div>

      <div className="grid min-w-0 gap-4 sm:gap-6 lg:grid-cols-3">
        {/*
         * Phones lead with the order ticket: the chart is the reference, but the
         * ticket is what someone opened the page to act on, and scrolling past a
         * 320px chart to reach it on every visit is the wrong default. The
         * laptop layout puts the chart back on the left.
         */}
        <Card className="min-w-0 lg:col-span-2 lg:order-1">
          <CardHeader>
            <CardTitle>Chart</CardTitle>
          </CardHeader>
          <CardContent>
            <CandleChart
              symbol={symbol}
              markers={markers}
              livePrice={quote?.price ?? null}
              enableTrading
            />
          </CardContent>
        </Card>

        <div className="flex min-w-0 flex-col gap-4 sm:gap-6 lg:order-2">
          {error && (
            <Card>
              <CardContent className="py-6 text-sm text-bear">
                <p className="break-words">{error}</p>
                {retryable && (
                  <button
                    onClick={() => setReloadKey((k) => k + 1)}
                    className="mt-2 min-h-9 cursor-pointer underline underline-offset-2"
                  >
                    Retry scan →
                  </button>
                )}
              </CardContent>
            </Card>
          )}
          {!result && !error && (
            <Card>
              <CardContent className="py-6 text-sm text-muted">
                Running the structural scan — macro structure, support analysis, pattern triggers…
              </CardContent>
            </Card>
          )}
          {result && <OrderTicket result={result} livePrice={livePrice} />}
        </div>
      </div>

      <MarketTabs symbol={symbol} result={result} />

      {result && <SignalCard result={result} />}

      <GlossaryDetails />
    </div>
  );
}

/** Height of the app nav the header pins beneath (`h-14`), in pixels. */
const NAV_HEIGHT = 56;

/**
 * Whether the header is currently pinned rather than sitting in its resting
 * place. Driven by the header's own position rather than a scroll offset, so
 * it stays correct when anything above it changes height.
 *
 * A sentinel element would be the other way to do this, but it has to be a
 * flex child of a `gap`-spaced column, and would open a gap of its own between
 * the header and the content below it.
 */
function useStuckHeader() {
  const headerRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const el = headerRef.current;
      if (el) setStuck(el.getBoundingClientRect().top <= NAV_HEIGHT + 0.5);
    };
    // One measurement per frame at most: the listener fires far more often
    // than the browser paints, and each measurement forces a layout read.
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  return { headerRef, stuck };
}

function PriceHeader({ quote, fallbackPrice }: { quote: LiveQuote | null; fallbackPrice: number | null }) {
  const price = quote?.price ?? fallbackPrice;
  if (price == null) return null;

  const session = quote?.session ?? "regular";
  const extended = session === "pre" || session === "post";
  const closed = session === "closed";
  const live = session === "regular" || quote?.assetClass === "crypto";

  // During extended hours / closed, the change we headline is the extended move
  // vs the regular close; during the regular session it's the day's change.
  const headlinePct = extended ? quote?.extendedPct : quote?.changePct;
  const headlineAbs = extended ? quote?.extendedAbs : quote?.changeAbs;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="font-mono text-lg font-semibold tabular-nums sm:text-2xl">
        {formatUsd(price)}
      </span>

      {headlinePct != null && headlineAbs != null && (
        <span
          className={cn(
            "font-mono text-sm font-medium tabular-nums",
            headlinePct >= 0 ? "text-bull" : "text-bear",
          )}
        >
          {headlineAbs >= 0 ? "+" : "−"}
          {formatUsd(Math.abs(headlineAbs))} ({formatPct(headlinePct)})
        </span>
      )}

      {/* Session pill */}
      <span
        className={cn(
          "flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
          live && "bg-bull/10 text-bull",
          extended && "bg-warn/15 text-warn",
          closed && "bg-muted/15 text-muted",
        )}
      >
        {live && (
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-bull opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-bull" />
          </span>
        )}
        {live ? "Live" : quote ? sessionLabel(session) : "…"}
      </span>

      {/*
       * When outside the regular session, show the official regular close
       * distinctly. It is a reference figure rather than a live one, so it
       * gives up its place on a phone, where the bar is pinned and every line
       * it takes is a line off the chart.
       */}
      {(extended || closed) && quote?.regularClose != null && (
        <span className="hidden text-xs text-muted sm:inline">
          Regular close <span className="font-mono tabular-nums">{formatUsd(quote.regularClose)}</span>
        </span>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
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
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Set when the failure is temporary (a throttled data feed), which is the
  // difference between offering a retry and calling the symbol unscannable.
  const [retryable, setRetryable] = useState(false);
  // Bumping this re-runs the scan without remounting the page.
  const [reloadKey, setReloadKey] = useState(0);
  const quote = useLiveQuote(symbol);

  useEffect(() => {
    let cancelled = false;
    setResult(null);
    setError(null);
    setRetryable(false);
    fetch(`/api/scan?ticker=${encodeURIComponent(symbol)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
        return res.json();
      })
      .then((data: ScanResult) => {
        if (cancelled) return;
        if (data.error) {
          setError(data.error);
          setRetryable(data.errorCode === "rate_limited" || data.errorCode === "upstream");
        } else {
          setResult(data);
        }
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : String(err)));
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

  return (
    // `min-w-0` on the column and on every grid child is what keeps a wide
    // child (the options chain, the depth ladder) scrolling inside its own box
    // instead of stretching the page — the cause of the sideways scroll and the
    // clipped header on phones.
    <div className="flex min-w-0 flex-col gap-4 sm:gap-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-xl font-semibold sm:text-2xl">{symbol}</h1>
        <PriceHeader quote={quote} fallbackPrice={livePrice} />
        {result?.gann.timeCycleActive && (
          <span className="text-xs font-medium text-warn">⏱ Cyclical turn window active</span>
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
      <span className="font-mono text-xl font-semibold tabular-nums sm:text-2xl">{formatUsd(price)}</span>

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

      {/* When outside the regular session, show the official regular close distinctly. */}
      {(extended || closed) && quote?.regularClose != null && (
        <span className="text-xs text-muted">
          Regular close <span className="font-mono tabular-nums">{formatUsd(quote.regularClose)}</span>
        </span>
      )}
    </div>
  );
}

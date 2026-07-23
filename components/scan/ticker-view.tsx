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
  const quote = useLiveQuote(symbol);

  useEffect(() => {
    let cancelled = false;
    setResult(null);
    setError(null);
    fetch(`/api/scan?ticker=${encodeURIComponent(symbol)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
        return res.json();
      })
      .then((data: ScanResult) => {
        if (cancelled) return;
        if (data.error) setError(data.error);
        else setResult(data);
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  const markers: PriceMarker[] = [];
  if (result?.levels) {
    markers.push(
      { price: result.levels.entry, label: "Entry", kind: "entry" },
      { price: result.levels.stopLoss, label: "Stop", kind: "stop" },
      { price: result.levels.takeProfit1, label: "TP1", kind: "target" },
      { price: result.levels.masterProfit, label: "Master", kind: "target" },
    );
  }
  result?.gann.fanLines.slice(0, 2).forEach((f) =>
    markers.push({ price: f.price, label: `Gann ${f.angle}`, kind: "gann" }),
  );
  result?.gann.squareOf9.slice(0, 2).forEach((s) =>
    markers.push({ price: s.price, label: `S9 ${s.degree}°`, kind: "gann" }),
  );

  // Live price falls back to the scan snapshot until the first poll returns.
  const livePrice = quote?.price ?? (result && result.currentPrice > 0 ? result.currentPrice : null);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-2xl font-semibold">{symbol}</h1>
        <PriceHeader quote={quote} fallbackPrice={livePrice} />
        {result?.gann.timeCycleActive && (
          <span className="text-xs font-medium text-warn">⏱ Gann time-cycle window active</span>
        )}
        <div className="ml-auto">
          <ShareButton symbol={symbol} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Chart</CardTitle>
          </CardHeader>
          <CardContent>
            <CandleChart symbol={symbol} markers={markers} livePrice={quote?.price ?? null} />
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          {error && (
            <Card>
              <CardContent className="py-6 text-sm text-bear">{error}</CardContent>
            </Card>
          )}
          {!result && !error && (
            <Card>
              <CardContent className="py-6 text-sm text-muted">
                Running the protocol scan — macro structure, Gann coordinates, Strat triggers…
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
      <span className="font-mono text-2xl font-semibold tabular-nums">{formatUsd(price)}</span>

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

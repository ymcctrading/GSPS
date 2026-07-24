"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CandleChart, type PriceMarker } from "@/components/chart/candles";
import { MarketTabs } from "@/components/chart/market-tabs";
import { ShareButton } from "@/components/chart/share-button";
import { SignalCard } from "@/components/scan/signal-card";
import { OrderTicket } from "@/components/trade/order-ticket";
import { GlossaryDetails } from "@/components/glossary";
import { formatUsd } from "@/lib/utils";
import type { ScanResult } from "@/lib/types";

export function TickerView({ symbol }: { symbol: string }) {
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline gap-3">
        <h1 className="text-2xl font-semibold">{symbol}</h1>
        {result && result.currentPrice > 0 && (
          <span className="font-mono text-lg text-muted">{formatUsd(result.currentPrice)}</span>
        )}
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
            <CandleChart symbol={symbol} markers={markers} />
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
          {result && <OrderTicket result={result} />}
        </div>
      </div>

      <MarketTabs symbol={symbol} result={result} />

      {result && <SignalCard result={result} />}

      <GlossaryDetails />
    </div>
  );
}

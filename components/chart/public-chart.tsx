"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TrendingUp } from "lucide-react";
import { CandleChart, type PriceMarker } from "@/components/chart/candles";
import { MarketTabs } from "@/components/chart/market-tabs";
import { ShareButton } from "@/components/chart/share-button";
import { formatUsd } from "@/lib/utils";
import type { ScanResult } from "@/lib/types";

/**
 * Read-only, publicly shareable chart view. No auth, no order ticket — just the
 * chart, drawing tools, alerts, and the Research / Options / Level II tabs.
 */
export function PublicChart({ symbol }: { symbol: string }) {
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
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border bg-surface/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <TrendingUp className="h-5 w-5 text-accent" /> GSPS
          </Link>
          <Link
            href="/signup"
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground"
          >
            Scan your own setups →
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <div className="mb-4 flex flex-wrap items-baseline gap-3">
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

        {error && (
          <div className="mb-4 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-bear">
            {error}
          </div>
        )}

        <div className="rounded-xl border border-border bg-surface p-4">
          <CandleChart symbol={symbol} markers={markers} />
        </div>

        <div className="mt-6">
          <MarketTabs symbol={symbol} result={result} />
        </div>

        <p className="mt-6 text-center text-xs text-muted">
          Shared via GSPS — market analysis, not financial advice. Trading involves risk of loss.
        </p>
      </main>
    </div>
  );
}

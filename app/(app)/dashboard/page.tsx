"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ResultsTable, type ScanRow } from "@/components/scan/results-table";
import { DEFAULTS } from "@/lib/sectors";
import type { ScanResult } from "@/lib/types";

interface DailyScanRow {
  symbol: string;
  direction: "bullish" | "bearish";
  rank: number;
  score: number;
  output_state: string;
  entry: number | null;
  stop_loss: number | null;
  take_profit_1: number | null;
  master_profit: number | null;
  scan_date: string;
  detail: { pattern?: { name?: string } | null } | null;
}

function toRows(rows: DailyScanRow[]): ScanRow[] {
  return rows.map((r) => ({
    symbol: r.symbol,
    score: r.score,
    outputState: r.output_state,
    direction: r.direction,
    entry: r.entry,
    stopLoss: r.stop_loss,
    takeProfit1: r.take_profit_1,
    masterProfit: r.master_profit,
    patternName: r.detail?.pattern?.name ?? null,
  }));
}

function toRowsFromScan(results: ScanResult[], direction: "bullish" | "bearish"): ScanRow[] {
  return results
    .filter((r) => r.direction === direction)
    .map((r) => ({
      symbol: r.symbol,
      score: r.decision.score,
      outputState: r.decision.outputState,
      direction: r.direction,
      entry: r.levels?.entry ?? null,
      stopLoss: r.levels?.stopLoss ?? null,
      takeProfit1: r.levels?.takeProfit1 ?? null,
      masterProfit: r.levels?.masterProfit ?? null,
      patternName: r.pattern?.name ?? null,
    }));
}

export default function DashboardPage() {
  const [latest, setLatest] = useState<{ scan_date: string } | null>(null);
  const [bullish, setBullish] = useState<ScanRow[]>([]);
  const [bearish, setBearish] = useState<ScanRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDailyScanResults();
  }, []);

  async function loadDailyScanResults() {
    try {
      setError(null);
      // First, try to load from database
      const dbRes = await fetch("/api/daily-scans?latest=1");
      if (dbRes.ok) {
        const data = await dbRes.json();
        if (data.latest?.scan_date) {
          setLatest(data.latest);
          setBullish(toRows(data.bullish || []));
          setBearish(toRows(data.bearish || []));
        }
      }
    } catch (err) {
      // Silently fail — user can manually run scan
    }
  }

  async function runLiveScan() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/market-scan", {
        method: "GET",
        headers: process.env.NEXT_PUBLIC_CRON_SECRET ? {
          "Authorization": `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET}`,
        } : {},
      });
      if (!res.ok) throw new Error(`Scan failed (${res.status})`);
      const output = await res.json();

      // Convert market scan results to row format
      const bullishRows = toRowsFromScan(output.bullish || [], "bullish").sort((a, b) => b.score - a.score);
      const bearishRows = toRowsFromScan(output.bearish || [], "bearish").sort((a, b) => b.score - a.score);

      setLatest({ scan_date: output.scanDate });
      setBullish(bullishRows);
      setBearish(bearishRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted">
            {latest?.scan_date
              ? `Daily market scan for ${latest.scan_date}`
              : "Run a live market scan to see top bullish and bearish reversion setups."}
          </p>
        </div>
        <Button
          onClick={runLiveScan}
          disabled={loading}
          className="whitespace-nowrap"
        >
          {loading ? "Scanning…" : "Run Live Scan"}
        </Button>
      </div>
      {error && <p className="rounded bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle>Default watchlist</CardTitle>
          <CardDescription>Magnificent Seven, SPY, and BTC — open any symbol for a full protocol scan.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
            {DEFAULTS.map((s) => (
              <Link
                key={s}
                href={`/ticker/${s}`}
                className="rounded-lg border border-border bg-background px-3 py-3 text-center text-sm font-semibold hover:border-accent hover:text-accent"
              >
                {s}
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-bull">Bullish reversions</CardTitle>
            <CardDescription>Top 15 setups near a bullish reversion point.</CardDescription>
          </CardHeader>
          <CardContent>
            <ResultsTable
              rows={bullish}
              emptyText="No bullish list yet. Run the market scan or wait for the daily cron."
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-bear">Bearish reversions</CardTitle>
            <CardDescription>Top 15 setups near a bearish reversion point.</CardDescription>
          </CardHeader>
          <CardContent>
            <ResultsTable
              rows={bearish}
              emptyText="No bearish list yet. Run the market scan or wait for the daily cron."
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ResultsTable, type ScanRow } from "@/components/scan/results-table";
import { SECTORS, COMING_SOON } from "@/lib/sectors";
import { cn } from "@/lib/utils";
import type { ScanResult } from "@/lib/types";

function toRow(r: ScanResult): ScanRow {
  return {
    symbol: r.symbol,
    score: r.decision.score,
    outputState: r.decision.outputState,
    direction: r.direction,
    entry: r.levels?.entry ?? null,
    stopLoss: r.levels?.stopLoss ?? null,
    takeProfit1: r.levels?.takeProfit1 ?? null,
    masterProfit: r.levels?.masterProfit ?? null,
    patternName: r.pattern?.name ?? null,
  };
}

export default function ScannerPage() {
  const [selected, setSelected] = useState<string[]>([]);
  const [custom, setCustom] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ScanRow[] | null>(null);
  const [failed, setFailed] = useState<string[]>([]);

  function toggleSector(key: string) {
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }

  async function runScan() {
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const symbols = new Set<string>();
      selected.forEach((key) => SECTORS[key].symbols.forEach((s) => symbols.add(s)));
      custom
        .split(/[,\s]+/)
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
        .forEach((s) => symbols.add(s));

      if (symbols.size === 0) {
        setError("Pick at least one industry or enter a symbol.");
        return;
      }

      const res = await fetch(`/api/batch-scan?tickers=${encodeURIComponent([...symbols].join(","))}`);
      if (!res.ok) throw new Error(`Scan failed (${res.status})`);
      const data = await res.json();
      const all = (data.results ?? []) as ScanResult[];
      const ok = all.filter((r) => !r.error);
      setFailed(all.filter((r) => r.error).map((r) => r.symbol));
      setResults(
        ok.map(toRow).sort((a, b) => b.score - a.score),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Scanner</h1>
        <p className="text-sm text-muted">
          Choose industries or enter symbols — the protocol scans top-down from ten years to fifteen minutes.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Universe</CardTitle>
          <CardDescription>Combine industries freely, or scan specific symbols.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            {Object.entries(SECTORS).map(([key, { label }]) => (
              <button
                key={key}
                onClick={() => toggleSector(key)}
                className={cn(
                  "rounded-full border border-border px-3.5 py-1.5 text-sm font-medium transition-colors cursor-pointer",
                  selected.includes(key)
                    ? "border-accent bg-accent-soft text-accent"
                    : "text-muted hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
            {COMING_SOON.map((label) => (
              <span
                key={label}
                className="rounded-full border border-dashed border-border px-3.5 py-1.5 text-sm text-muted/60"
              >
                {label} <Badge variant="muted" className="ml-1">soon</Badge>
              </span>
            ))}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder="Custom symbols — e.g. SPY, PLTR, BTC/USD"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runScan()}
            />
            <Button onClick={runScan} disabled={loading} className="sm:w-40">
              {loading ? "Scanning…" : "Run scan"}
            </Button>
          </div>
          {error && <p className="text-sm text-bear">{error}</p>}
        </CardContent>
      </Card>

      {results && (
        <Card>
          <CardHeader>
            <CardTitle>Results</CardTitle>
            <CardDescription>
              Sorted by score. Open a symbol for the chart, breakdown, and order ticket.
              {failed.length > 0 && ` Failed: ${failed.join(", ")}.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResultsTable rows={results} emptyText="No symbols produced a scan result." />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

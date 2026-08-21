"use client";

/**
 * A live, rolling expectancy readout for the verdict a user is about to act
 * on. Before this existed, the only way to see whether Guided's Execute
 * recommendations were currently profitable was to know the Backtest tool at
 * /learning existed and run it with the right inputs — a 2026-08-21
 * walkthrough found the live figure negative (Execute: -0.053R over 88
 * trades) with nothing in the default UI surfacing it. This calls the same
 * `/api/backtest` endpoint Backtest uses, with its own defaults, so the
 * number here is never a hand-picked window.
 *
 * Deliberately neutral: it states the figure and the window, not a verdict on
 * why it reads the way it does. Whether a negative run is a scoring-model
 * problem or a short-window artifact is an open question — see "Open
 * question: is masterStructural inverted?" and "The verdict ladder has not
 * held up out of sample" in docs/BACKTESTING.md — and this widget's job is
 * visibility, not a claim this codebase cannot yet back up.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fetchWithTimeout } from "@/lib/utils";
import { Activity, ArrowRight } from "lucide-react";

interface BucketLike {
  bucket: string;
  trades: number;
  winRate: number;
  expectancyR: number;
  profitable: boolean;
}

interface BacktestReportShape {
  live: boolean;
  source: string;
  targetR: number;
  breakEvenWinRate: number;
  window: { from: string | null; to: string | null };
  generatedAt: string;
  overall: { trades: number; winRate: number; expectancyR: number; profitable: boolean };
  buckets: BucketLike[];
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const rFmt = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(3)}R`;

function dateOnly(iso: string): string {
  return iso.slice(0, 10);
}

export function LiveExpectancy() {
  const [report, setReport] = useState<BacktestReportShape | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchWithTimeout("/api/backtest")
      .then((res) => res.json())
      .then((body) => {
        if (cancelled) return;
        if (body?.error) throw new Error(body.error);
        setReport(body as BacktestReportShape);
      })
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card className={report && !report.overall.profitable ? "border-warn" : undefined}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-accent" /> Live expectancy
        </CardTitle>
        <CardDescription>
          {error
            ? "Couldn't load the live figure right now."
            : report
              ? <>
                  {report.window.from && report.window.to
                    ? `${dateOnly(report.window.from)} → ${dateOnly(report.window.to)}`
                    : "Window unknown"}{" "}
                  · break-even at {report.targetR}R is a {pct(report.breakEvenWinRate)} win rate ·{" "}
                  {report.live ? `live as of ${dateOnly(report.generatedAt)}` : "simulated data"}
                </>
              : "Loading…"}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!error && report && !report.live && (
          <Badge variant="warn" className="self-start">
            Simulated — {report.source} generator, not a market feed
          </Badge>
        )}

        {!error && report && (
          <div className="grid gap-3 sm:grid-cols-2">
            {(["Execute", "All"] as const).map((label) => {
              const b =
                label === "All"
                  ? { bucket: "All", ...report.overall }
                  : report.buckets.find((x) => x.bucket === "Execute");
              if (!b || b.trades === 0) {
                return (
                  <div key={label} className="rounded-lg border border-border bg-background px-4 py-3 text-sm">
                    <p className="font-medium">{label}</p>
                    <p className="text-muted">No trades in this window.</p>
                  </div>
                );
              }
              return (
                <div key={label} className="rounded-lg border border-border bg-background px-4 py-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{label}</p>
                    <Badge variant={b.profitable ? "bull" : "bear"}>
                      {b.profitable ? "Above break-even" : "Below break-even"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-muted">
                    {b.trades} trades · {pct(b.winRate)} win rate ·{" "}
                    <span className={b.expectancyR >= 0 ? "text-bull" : "text-bear"}>
                      {rFmt(b.expectancyR)} avg
                    </span>
                  </p>
                </div>
              );
            })}
          </div>
        )}

        <Link
          href="/learning"
          className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-accent hover:underline"
        >
          Full backtest breakdown
          <ArrowRight className="h-4 w-4" />
        </Link>
      </CardContent>
    </Card>
  );
}

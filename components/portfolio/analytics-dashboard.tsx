"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatUsd, cn } from "@/lib/utils";
import type { PortfolioAnalytics, PnlBucket, EquityPoint } from "@/lib/portfolio/analytics";

/**
 * Closed-trade performance analytics: win/loss + profit factor + Sharpe as
 * stat cards, a monthly P&L bar chart, an equity/drawdown curve, and a
 * performance-by-pattern table.
 *
 * Charting note: `lightweight-charts` is the only chart lib in the project
 * and is built for OHLC/time-series price panes, not small stat bar charts —
 * for these compact visuals plain inline SVG is simpler and keeps this
 * dashboard dependency-free, matching the "no new npm deps" constraint.
 */
export function AnalyticsDashboard() {
  const [analytics, setAnalytics] = useState<PortfolioAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/portfolio/analytics")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        if (!cancelled) setAnalytics(data.analytics);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-bear">{error}</CardContent>
      </Card>
    );
  }

  if (!analytics) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-muted">
          Loading performance analytics…
        </CardContent>
      </Card>
    );
  }

  if (analytics.winLoss.trades === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Performance Analytics</CardTitle>
          <CardDescription>
            Win rate, Sharpe ratio, drawdown, and P&L by month and pattern — computed from closed
            trades.
          </CardDescription>
        </CardHeader>
        <CardContent className="py-6 text-center text-sm text-muted">
          Not enough closed trades yet. Analytics appear once you have exited positions.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat
          label="Win rate"
          value={
            analytics.winLoss.winRatePct == null
              ? "—"
              : `${analytics.winLoss.winRatePct.toFixed(1)}%`
          }
          sub={`${analytics.winLoss.wins}W / ${analytics.winLoss.losses}L`}
        />
        <Stat
          label="Profit factor"
          value={analytics.profitFactor == null ? "N/A" : analytics.profitFactor.toFixed(2)}
          sub={analytics.profitFactor == null ? "no losses recorded" : "gross profit / gross loss"}
        />
        <Stat
          label="Sharpe ratio"
          value={analytics.sharpeRatio == null ? "N/A" : analytics.sharpeRatio.toFixed(2)}
          sub="annualized, per-trade"
        />
        <Stat
          label="Max drawdown"
          value={formatUsd(-analytics.drawdown.maxDrawdownDollars)}
          sub={
            analytics.drawdown.maxDrawdownPct == null
              ? "peak-to-trough"
              : `${analytics.drawdown.maxDrawdownPct.toFixed(1)}% from peak`
          }
          tone={analytics.drawdown.maxDrawdownDollars > 0 ? "bear" : undefined}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Monthly P&L</CardTitle>
          <CardDescription>Sum of realized P/L per calendar month, by exit date.</CardDescription>
        </CardHeader>
        <CardContent>
          <PnlBarChart buckets={analytics.monthlyPnl} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Equity Curve</CardTitle>
          <CardDescription>
            Cumulative realized P/L across closed trades, in exit order. Baseline is $0, not account
            equity.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EquityCurve curve={analytics.drawdown.curve} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Performance by Pattern</CardTitle>
          <CardDescription>Win rate and P&L grouped by the signal called at entry.</CardDescription>
        </CardHeader>
        <CardContent>
          <PatternTable rows={analytics.byPattern} />
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "bull" | "bear";
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted">{label}</p>
        <p
          className={cn(
            "mt-1 font-mono text-lg font-semibold",
            tone === "bull" && "text-bull",
            tone === "bear" && "text-bear",
          )}
        >
          {value}
        </p>
        {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
      </CardContent>
    </Card>
  );
}

/** Minimal inline SVG bar chart — no chart lib needed for a handful of bars. */
function PnlBarChart({ buckets }: { buckets: PnlBucket[] }) {
  if (buckets.length === 0) {
    return <p className="py-6 text-center text-sm text-muted">No monthly data yet.</p>;
  }

  const width = 640;
  const height = 160;
  const padding = 24;
  const max = Math.max(...buckets.map((b) => b.pnlDollars), 0);
  const min = Math.min(...buckets.map((b) => b.pnlDollars), 0);
  const range = max - min || 1;
  const zeroY = padding + (max / range) * (height - padding * 2);
  const barWidth = (width - padding * 2) / buckets.length;

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-40 w-full min-w-[480px]"
        role="img"
        aria-label="Monthly profit and loss bar chart"
      >
        <line
          x1={padding}
          y1={zeroY}
          x2={width - padding}
          y2={zeroY}
          className="stroke-border"
          strokeWidth={1}
        />
        {buckets.map((b, i) => {
          const barHeight = (Math.abs(b.pnlDollars) / range) * (height - padding * 2);
          const x = padding + i * barWidth + barWidth * 0.15;
          const y = b.pnlDollars >= 0 ? zeroY - barHeight : zeroY;
          return (
            <g key={b.key}>
              <rect
                x={x}
                y={y}
                width={barWidth * 0.7}
                height={Math.max(barHeight, 1)}
                className={b.pnlDollars >= 0 ? "fill-bull" : "fill-bear"}
                rx={2}
              >
                <title>
                  {b.key}: {formatUsd(b.pnlDollars)} ({b.trades} trade{b.trades === 1 ? "" : "s"})
                </title>
              </rect>
              <text
                x={x + (barWidth * 0.7) / 2}
                y={height - 4}
                textAnchor="middle"
                className="fill-muted text-[9px]"
              >
                {b.key.slice(2)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Minimal inline SVG area chart of the cumulative equity curve. */
function EquityCurve({ curve }: { curve: EquityPoint[] }) {
  if (curve.length < 2) {
    return (
      <p className="py-6 text-center text-sm text-muted">
        Not enough closed trades yet to draw an equity curve.
      </p>
    );
  }

  const width = 640;
  const height = 160;
  const padding = 12;
  const values = curve.map((p) => p.equity);
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const range = max - min || 1;

  const scaleX = (i: number) => padding + (i / (curve.length - 1)) * (width - padding * 2);
  const scaleY = (v: number) => padding + (1 - (v - min) / range) * (height - padding * 2);

  const linePath = curve.map((p, i) => `${i === 0 ? "M" : "L"}${scaleX(i)},${scaleY(p.equity)}`).join(" ");
  const areaPath = `${linePath} L${scaleX(curve.length - 1)},${scaleY(0)} L${scaleX(0)},${scaleY(0)} Z`;
  const finalEquity = curve[curve.length - 1].equity;

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-40 w-full min-w-[480px]"
        role="img"
        aria-label="Cumulative equity curve"
      >
        <line
          x1={padding}
          y1={scaleY(0)}
          x2={width - padding}
          y2={scaleY(0)}
          className="stroke-border"
          strokeWidth={1}
        />
        <path
          d={areaPath}
          className={finalEquity >= 0 ? "fill-bull/10" : "fill-bear/10"}
        />
        <path
          d={linePath}
          fill="none"
          className={finalEquity >= 0 ? "stroke-bull" : "stroke-bear"}
          strokeWidth={2}
        />
      </svg>
    </div>
  );
}

function PatternTable({ rows }: { rows: PortfolioAnalytics["byPattern"] }) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted">No pattern data yet.</p>;
  }

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted">
            <th className="py-2 pr-3 font-normal">Pattern</th>
            <th className="py-2 pr-3 text-right font-normal">Trades</th>
            <th className="py-2 pr-3 text-right font-normal">Win rate</th>
            <th className="py-2 pr-3 text-right font-normal">Total P&L</th>
            <th className="py-2 text-right font-normal">Avg P&L</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.pattern} className="border-b border-border/60 last:border-0">
              <td className="py-2 pr-3">{row.pattern}</td>
              <td className="py-2 pr-3 text-right font-mono tabular-nums">{row.trades}</td>
              <td className="py-2 pr-3 text-right font-mono tabular-nums">
                {row.winRatePct.toFixed(1)}%
              </td>
              <td
                className={cn(
                  "py-2 pr-3 text-right font-mono tabular-nums",
                  row.totalPnlDollars >= 0 ? "text-bull" : "text-bear",
                )}
              >
                {formatUsd(row.totalPnlDollars)}
              </td>
              <td
                className={cn(
                  "py-2 text-right font-mono tabular-nums",
                  row.avgPnlDollars >= 0 ? "text-bull" : "text-bear",
                )}
              >
                {formatUsd(row.avgPnlDollars)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {rows.slice(0, 3).map((row) => (
            <Badge key={row.pattern} variant={row.totalPnlDollars >= 0 ? "bull" : "bear"}>
              {row.pattern}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

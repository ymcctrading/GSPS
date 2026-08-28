"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatUsd, cn } from "@/lib/utils";
import { authorizedFetch } from "@/lib/supabase/authorized-fetch";
import { maxDrawdown, sharpeRatio, type EquityPoint as MetricEquityPoint } from "@/lib/portfolio/equity-metrics";

interface Summary {
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  profit_factor: number | null;
  total_pnl: number;
}

interface PnlRow {
  period_start: string;
  trade_count: number;
  total_pnl: number;
}

interface PatternRow {
  pattern: string;
  trade_count: number;
  win_rate: number;
  total_pnl: number;
  avg_pnl: number;
}

interface EquityRow {
  trade_date: string;
  pnl: number;
  equity: number;
}

interface Loaded {
  summary: Summary;
  monthly: PnlRow[];
  patterns: PatternRow[];
  equity: EquityRow[];
}

/**
 * Closed-trade performance analytics, on top of the SQL functions
 * `get_performance_metrics` / `get_pnl_by_period` / `get_performance_by_pattern`
 * / `get_equity_curve` (migration 0023) and their `/api/portfolio/analytics`
 * route. That route returns `sharpe_ratio`/`max_drawdown` as `null` — its own
 * comment says they're "calculated separately for now" — so this computes
 * those two client-side from the equity-curve rows (`lib/portfolio/equity-metrics.ts`)
 * rather than duplicating what the SQL functions already compute.
 *
 * Charting note: `lightweight-charts` is the only chart lib in the project
 * and is built for OHLC/time-series price panes, not small stat bar charts —
 * for these compact visuals plain inline SVG is simpler and keeps this
 * dashboard dependency-free.
 */
export function AnalyticsDashboard() {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const period = "730"; // ~2 years
    Promise.all([
      authorizedFetch(`/api/portfolio/analytics?metric=summary&period=${period}`).then((r) => r.json()),
      authorizedFetch(`/api/portfolio/analytics?metric=pnl&period_type=monthly&period=${period}`).then((r) =>
        r.json(),
      ),
      authorizedFetch(`/api/portfolio/analytics?metric=patterns&period=${period}`).then((r) => r.json()),
      authorizedFetch(`/api/portfolio/analytics?metric=equity&starting_capital=0`).then((r) => r.json()),
    ])
      .then(([summaryRes, pnlRes, patternsRes, equityRes]) => {
        if (cancelled) return;
        if (summaryRes?.error) throw new Error(summaryRes.error);
        const summary: Summary = Array.isArray(summaryRes) ? summaryRes[0] : summaryRes;
        setData({
          summary,
          monthly: Array.isArray(pnlRes) ? [...pnlRes].reverse() : [],
          patterns: Array.isArray(patternsRes) ? patternsRes : [],
          equity: Array.isArray(equityRes) ? equityRes : [],
        });
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

  if (!data) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-muted">
          Loading performance analytics…
        </CardContent>
      </Card>
    );
  }

  if (!data.summary || data.summary.total_trades === 0) {
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

  const equityPoints: MetricEquityPoint[] = data.equity.map((e) => ({
    trade_date: e.trade_date,
    pnl: e.pnl,
    equity: e.equity,
  }));
  const drawdown = maxDrawdown(equityPoints);
  const sharpe = sharpeRatio(equityPoints);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat
          label="Win rate"
          value={`${data.summary.win_rate.toFixed(1)}%`}
          sub={`${data.summary.winning_trades}W / ${data.summary.losing_trades}L`}
        />
        <Stat
          label="Profit factor"
          value={data.summary.profit_factor == null ? "N/A" : data.summary.profit_factor.toFixed(2)}
          sub={data.summary.profit_factor == null ? "no losses recorded" : "gross profit / gross loss"}
        />
        <Stat
          label="Sharpe ratio"
          value={sharpe == null ? "N/A" : sharpe.toFixed(2)}
          sub="annualized, per-trade"
        />
        <Stat
          label="Max drawdown"
          value={drawdown == null ? "N/A" : formatUsd(-drawdown.amount)}
          sub={
            drawdown?.percent == null ? "peak-to-trough" : `${drawdown.percent.toFixed(1)}% from peak`
          }
          tone={drawdown && drawdown.amount > 0 ? "bear" : undefined}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Monthly P&L</CardTitle>
          <CardDescription>Sum of realized P/L per calendar month, by exit date.</CardDescription>
        </CardHeader>
        <CardContent>
          <PnlBarChart rows={data.monthly} />
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
          <EquityCurve rows={data.equity} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Performance by Pattern</CardTitle>
          <CardDescription>Win rate and P&L grouped by the signal called at entry.</CardDescription>
        </CardHeader>
        <CardContent>
          <PatternTable rows={data.patterns} />
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
function PnlBarChart({ rows }: { rows: PnlRow[] }) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted">No monthly data yet.</p>;
  }

  const width = 640;
  const height = 160;
  const padding = 24;
  const max = Math.max(...rows.map((b) => b.total_pnl), 0);
  const min = Math.min(...rows.map((b) => b.total_pnl), 0);
  const range = max - min || 1;
  const zeroY = padding + (max / range) * (height - padding * 2);
  const barWidth = (width - padding * 2) / rows.length;

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
        {rows.map((b, i) => {
          const barHeight = (Math.abs(b.total_pnl) / range) * (height - padding * 2);
          const x = padding + i * barWidth + barWidth * 0.15;
          const y = b.total_pnl >= 0 ? zeroY - barHeight : zeroY;
          const label = b.period_start.slice(2, 7); // "26-08"
          return (
            <g key={b.period_start}>
              <rect
                x={x}
                y={y}
                width={barWidth * 0.7}
                height={Math.max(barHeight, 1)}
                className={b.total_pnl >= 0 ? "fill-bull" : "fill-bear"}
                rx={2}
              >
                <title>
                  {b.period_start}: {formatUsd(b.total_pnl)} ({b.trade_count} trade
                  {b.trade_count === 1 ? "" : "s"})
                </title>
              </rect>
              <text
                x={x + (barWidth * 0.7) / 2}
                y={height - 4}
                textAnchor="middle"
                className="fill-muted text-[9px]"
              >
                {label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Minimal inline SVG area chart of the cumulative equity curve. */
function EquityCurve({ rows }: { rows: EquityRow[] }) {
  if (rows.length < 2) {
    return (
      <p className="py-6 text-center text-sm text-muted">
        Not enough closed trades yet to draw an equity curve.
      </p>
    );
  }

  const width = 640;
  const height = 160;
  const padding = 12;
  const values = rows.map((p) => p.equity);
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const range = max - min || 1;

  const scaleX = (i: number) => padding + (i / (rows.length - 1)) * (width - padding * 2);
  const scaleY = (v: number) => padding + (1 - (v - min) / range) * (height - padding * 2);

  const linePath = rows.map((p, i) => `${i === 0 ? "M" : "L"}${scaleX(i)},${scaleY(p.equity)}`).join(" ");
  const areaPath = `${linePath} L${scaleX(rows.length - 1)},${scaleY(0)} L${scaleX(0)},${scaleY(0)} Z`;
  const finalEquity = rows[rows.length - 1].equity;

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
        <path d={areaPath} className={finalEquity >= 0 ? "fill-bull/10" : "fill-bear/10"} />
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

function PatternTable({ rows }: { rows: PatternRow[] }) {
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
              <td className="py-2 pr-3 text-right font-mono tabular-nums">{row.trade_count}</td>
              <td className="py-2 pr-3 text-right font-mono tabular-nums">{row.win_rate.toFixed(1)}%</td>
              <td
                className={cn(
                  "py-2 pr-3 text-right font-mono tabular-nums",
                  row.total_pnl >= 0 ? "text-bull" : "text-bear",
                )}
              >
                {formatUsd(row.total_pnl)}
              </td>
              <td
                className={cn(
                  "py-2 text-right font-mono tabular-nums",
                  row.avg_pnl >= 0 ? "text-bull" : "text-bear",
                )}
              >
                {formatUsd(row.avg_pnl)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {rows.slice(0, 3).map((row) => (
            <Badge key={row.pattern} variant={row.total_pnl >= 0 ? "bull" : "bear"}>
              {row.pattern}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

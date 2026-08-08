"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { BacktestReport, Bucket } from "@/lib/backtest/run";

const DEFAULT_SYMBOLS = "SPY, AAPL, AMD, TSLA, MSFT, NVDA";

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
/** R is signed and small; the sign is the whole point, so it is always shown. */
const r = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(3)}R`;

function toneFor(value: number) {
  return value > 0 ? "text-bull" : value < 0 ? "text-bear" : "text-muted";
}

export default function LearningPage() {
  const [symbols, setSymbols] = useState(DEFAULT_SYMBOLS);
  const [within, setWithin] = useState<Bucket>("Execute");
  const [targetR, setTargetR] = useState("2");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<BacktestReport | null>(null);

  async function run(bucket: Bucket = within) {
    setLoading(true);
    setError(null);
    try {
      const list = symbols
        .split(/[,\s]+/)
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
      if (list.length === 0) {
        setError("Enter at least one symbol.");
        return;
      }
      const params = new URLSearchParams({
        symbols: list.join(","),
        within: bucket,
        targetR,
      });
      const res = await fetch(`/api/backtest?${params}`);
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? `Request failed (${res.status})`);
        return;
      }
      setReport(body as BacktestReport);
      setWithin(bucket);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Backtest</h1>
        <p className="text-sm text-muted">
          Replays the protocol&apos;s own entry logic bar by bar over historical data, then splits
          the result by the verdict the scanner would have shown. Use it to check whether a change
          to the score moved expectancy — not to confirm that it should have.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Run a replay</CardTitle>
          <CardDescription>
            15-minute execution bars, scored against daily history from before each trading day.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="min-w-0 flex-1 text-sm">
              <span className="mb-1 block text-muted">Symbols</span>
              <Input
                value={symbols}
                onChange={(e) => setSymbols(e.target.value)}
                placeholder="SPY, AAPL"
              />
            </label>
            <label className="text-sm sm:w-28">
              <span className="mb-1 block text-muted">Target (R)</span>
              <Input
                value={targetR}
                onChange={(e) => setTargetR(e.target.value)}
                inputMode="decimal"
              />
            </label>
            <Button onClick={() => run()} disabled={loading}>
              {loading ? "Replaying…" : "Run"}
            </Button>
          </div>
          {error && <p className="text-sm text-bear">{error}</p>}
        </CardContent>
      </Card>

      {report && (
        <>
          {!report.live && (
            <Card className="border-warn">
              <CardContent className="pt-4">
                <p className="text-sm">
                  <Badge variant="warn">Simulated data</Badge>{" "}
                  These bars came from the <code>{report.source}</code> generator, not a market
                  feed. It is a seeded random walk, so every number below describes the generator.
                  Configure market-data credentials before reading any of this as a result.
                </p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Expectancy by verdict</CardTitle>
              <CardDescription>
                {report.overall.trades} trades from {report.armed} armed setups (
                {report.triggered} triggered) across {report.symbols.length}{" "}
                {report.symbols.length === 1 ? "symbol" : "symbols"} · {report.source}
                {report.skipped.length > 0 && ` · ${report.skipped.length} skipped`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <THead>
                  <TR>
                    <TH>Bucket</TH>
                    <TH className="text-right">Trades</TH>
                    <TH className="text-right">Win rate</TH>
                    <TH className="text-right">Expectancy</TH>
                    <TH className="text-right">Total</TH>
                    <TH />
                  </TR>
                </THead>
                <TBody>
                  {report.buckets.map((b) => (
                    <TR key={b.bucket}>
                      <TD className="font-medium">{b.bucket}</TD>
                      <TD className="text-right tabular-nums">{b.trades}</TD>
                      <TD className="text-right tabular-nums">
                        {b.trades === 0 ? "—" : pct(b.winRate)}
                      </TD>
                      <TD className={cn("text-right tabular-nums", toneFor(b.expectancyR))}>
                        {b.trades === 0 ? "—" : r(b.expectancyR)}
                      </TD>
                      <TD className={cn("text-right tabular-nums", toneFor(b.totalR))}>
                        {b.trades === 0 ? "—" : r(b.totalR)}
                      </TD>
                      <TD className="text-right">
                        <button
                          onClick={() => run(b.bucket)}
                          disabled={loading || b.trades === 0}
                          className={cn(
                            "cursor-pointer text-xs text-accent hover:underline disabled:cursor-default disabled:text-muted disabled:no-underline",
                            b.bucket === report.attributeWithin && "font-semibold",
                          )}
                        >
                          {b.bucket === report.attributeWithin ? "attributed" : "attribute"}
                        </button>
                      </TD>
                    </TR>
                  ))}
                  <TR className="border-t-2 border-border">
                    <TD className="font-medium">All</TD>
                    <TD className="text-right tabular-nums">{report.overall.trades}</TD>
                    <TD className="text-right tabular-nums">{pct(report.overall.winRate)}</TD>
                    <TD className={cn("text-right tabular-nums", toneFor(report.overall.expectancyR))}>
                      {r(report.overall.expectancyR)}
                    </TD>
                    <TD className={cn("text-right tabular-nums", toneFor(report.overall.totalR))}>
                      {r(report.overall.totalR)}
                    </TD>
                    <TD />
                  </TR>
                </TBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Factors inside {report.attributeWithin}</CardTitle>
              <CardDescription>
                Expectancy when each criterion passed versus when it failed, over the{" "}
                {report.buckets.find((b) => b.bucket === report.attributeWithin)?.trades ?? 0} trades
                in this bucket. Δ is the lever: positive means up-weighting the criterion should
                help. Marginal, not causal — a factor can read well because it travels with one
                that works.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {report.factors.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted">
                  No scored trades in this bucket. The score only runs when a symbol has at least
                  120 daily bars before the trading day.
                </p>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH className="sticky left-0 z-10 bg-surface">Criterion</TH>
                      <TH className="text-right">Passed</TH>
                      <TH className="text-right">E[R] pass</TH>
                      <TH className="text-right">E[R] fail</TH>
                      <TH className="text-right">Δ E[R]</TH>
                      <TH className="text-right">Δ win</TH>
                      <TH className="text-right">Corr</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {report.factors.map((f) => {
                      const readable = f.verdict === "informative";
                      return (
                        <TR key={f.criterion} className={cn(!readable && "opacity-60")}>
                          <TD className="sticky left-0 z-10 max-w-[16rem] truncate bg-surface">
                            <span title={f.criterion}>{f.criterion}</span>
                            {f.verdict === "constant" && (
                              <Badge variant="muted" className="ml-2">
                                never varied
                              </Badge>
                            )}
                            {f.verdict === "insufficient" && (
                              <Badge variant="muted" className="ml-2">
                                too few
                              </Badge>
                            )}
                          </TD>
                          <TD className="text-right tabular-nums text-muted">
                            {f.passed.n}/{f.observed}
                          </TD>
                          <TD className="text-right tabular-nums">
                            {f.passed.n === 0 ? "—" : r(f.passed.expectancyR)}
                          </TD>
                          <TD className="text-right tabular-nums">
                            {f.failed.n === 0 ? "—" : r(f.failed.expectancyR)}
                          </TD>
                          <TD
                            className={cn(
                              "text-right font-medium tabular-nums",
                              readable && f.deltaExpectancyR !== undefined
                                ? toneFor(f.deltaExpectancyR)
                                : "text-muted",
                            )}
                          >
                            {readable && f.deltaExpectancyR !== undefined
                              ? r(f.deltaExpectancyR)
                              : "—"}
                          </TD>
                          <TD className="text-right tabular-nums text-muted">
                            {readable && f.deltaWinRate !== undefined ? pct(f.deltaWinRate) : "—"}
                          </TD>
                          <TD className="text-right tabular-nums text-muted">
                            {f.correlation === undefined ? "—" : f.correlation.toFixed(2)}
                          </TD>
                        </TR>
                      );
                    })}
                  </TBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Stop width</CardTitle>
              <CardDescription>
                Expectancy by stop distance in ATR, inside {report.attributeWithin}. This is the one
                continuous lever the protocol already gates on — the risk floor in{" "}
                <code>patterns.ts</code> and <code>MAX_STOP_ATR_MULTIPLE</code> are both thresholds
                on this number, and both are knowable before the trade.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <THead>
                  <TR>
                    <TH>Band (×ATR)</TH>
                    <TH className="text-right">Trades</TH>
                    <TH className="text-right">Win rate</TH>
                    <TH className="text-right">Expectancy</TH>
                  </TR>
                </THead>
                <TBody>
                  {report.atrBands.map((b) => (
                    <TR key={b.from}>
                      <TD className="tabular-nums">
                        {b.from.toFixed(1)}–{b.to === null ? "∞" : b.to.toFixed(1)}
                      </TD>
                      <TD className="text-right tabular-nums">{b.trades}</TD>
                      <TD className="text-right tabular-nums">
                        {b.trades === 0 ? "—" : pct(b.winRate)}
                      </TD>
                      <TD className={cn("text-right tabular-nums", toneFor(b.expectancyR))}>
                        {b.trades === 0 ? "—" : r(b.expectancyR)}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>

          {report.skipped.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Skipped</CardTitle>
                <CardDescription>
                  These symbols returned no usable bars and are not in the totals above.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                {report.skipped.map((s) => (
                  <p key={s.symbol}>
                    <span className="font-medium">{s.symbol}</span>{" "}
                    <span className="text-muted">— {s.reason}</span>
                  </p>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

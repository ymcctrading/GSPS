"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { AttributionScope, RunSummary } from "@/lib/backtest/run";
import type { PublicBacktestReport as BacktestReport } from "@/lib/backtest/factorLabels";
import { UNCONDITIONED_ATTRIBUTION } from "@/lib/backtest/scope";

const DEFAULT_SYMBOLS = "SPY, AAPL, AMD, TSLA, MSFT, NVDA";

/**
 * The Execute-tier backtest baseline `GET /api/shadow/summary` compares live
 * shadow-mode performance against — mirrors
 * `lib/shadow/compare.ts`'s `EXECUTE_TIER_BACKTEST_BASELINE`. Duplicated as
 * plain values rather than imported: that module pulls in the Resend SDK
 * (`lib/notifications/resend-handler.ts`, for the operator alert email),
 * which has no reason to ship in a client bundle. Update both together —
 * same manual-bump discipline as `STRATEGY_VERSION`.
 */
const BACKTEST_BASELINE = { trades: 31, winRate: 0.387, expectancyR: 0.151 };
/**
 * That baseline was measured on earlier rules (a stop entry and a fixed
 * target), so it is shown for reference and not sent for a drift verdict
 * (R-032, 2026-10-21). Set this true once it is re-based on the current rules.
 */
const BASELINE_COMPARABLE = false;
/** Mirrors `lib/shadow/compare.ts`'s `MIN_SHADOW_SAMPLES` — below this, a comparison is withheld server-side too. */
const MIN_SHADOW_SAMPLES_HINT = 15;

interface ShadowSummaryResponse {
  windowDays: number;
  maxHoldDays: number;
  shadow: { trades: number; winRate: number; expectancyR: number };
  pending: number;
  baselineSupplied: boolean;
  drift: {
    reason: string;
    expectancyDeltaR: number;
    winRateDeltaPct: number;
  } | null;
}

/**
 * Below this many trades a group's average can turn on one or two trades, so
 * the page says so rather than inviting a comparison (an engineering figure,
 * the usual rule of thumb for a sample mean).
 */
const MIN_COMPARABLE_TRADES = 30;

/** Mirrors `MIN_DAILY_BARS_FOR_SCAN` (lib/scan/entrySelection.ts), not imported to keep the scan code out of the bundle. */
const MIN_DAILY_BARS_HINT = 30;

const BUCKET_NAMES: Record<string, string> = { unscored: "Not scored" };
const bucketName = (b: string) => BUCKET_NAMES[b] ?? b;
const scopeName = (s: string) => (s === UNCONDITIONED_ATTRIBUTION ? "every trade" : bucketName(s));

/** Wins over the trades that closed inside the test, not over the ones still open. */
function decidedWinRate(s: Pick<RunSummary, "trades" | "winRate" | "timeouts">): number | null {
  const decided = s.trades - (s.timeouts ?? 0);
  return decided > 0 ? (s.winRate * s.trades) / decided : null;
}

/** Two summaries as one row (reversals with re-entries); exact for every field shown. */
function combine(a: RunSummary, b: RunSummary): RunSummary {
  const trades = a.trades + b.trades;
  const totalR = a.totalR + b.totalR;
  return {
    ...a,
    trades,
    totalR,
    expectancyR: trades > 0 ? totalR / trades : 0,
    winRate: trades > 0 ? (a.winRate * a.trades + b.winRate * b.trades) / trades : 0,
    timeouts: (a.timeouts ?? 0) + (b.timeouts ?? 0),
    openAtEnd: a.openAtEnd + b.openAtEnd,
    profitable: trades > 0 && totalR > 0,
  };
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
/** R is signed and small; the sign is the whole point, so it is always shown. */
const r = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(3)}R`;

function toneFor(value: number) {
  return value > 0 ? "text-bull" : value < 0 ? "text-bear" : "text-muted";
}

export default function LearningPage() {
  const [symbols, setSymbols] = useState(DEFAULT_SYMBOLS);
  const [within, setWithin] = useState<AttributionScope>("Execute");
  // No profit goal and no stop choice (2026-10-28): the route trades the
  // production plan on production's exits by default, which fix no target and
  // place the stop from the plan, so a "profit goal" changed nothing and the
  // wider-stop box changed nothing under the reaction entry.
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<BacktestReport | null>(null);

  const [shadowSummary, setShadowSummary] = useState<ShadowSummaryResponse | null>(null);
  const [shadowError, setShadowError] = useState<string | null>(null);
  const [shadowLoading, setShadowLoading] = useState(true);

  // Independent of the backtest tool below — this is always-on shadow-mode
  // tracking (lib/shadow/*), not something the user runs on demand, so it
  // loads once on mount rather than behind a button.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams(
          BASELINE_COMPARABLE
            ? {
                backtestTrades: String(BACKTEST_BASELINE.trades),
                backtestWinRate: String(BACKTEST_BASELINE.winRate),
                backtestExpectancyR: String(BACKTEST_BASELINE.expectancyR),
              }
            : {},
        );
        const res = await fetch(`/api/shadow/summary?${params}`);
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setShadowError(body.error ?? `Request failed (${res.status})`);
          return;
        }
        setShadowSummary(body as ShadowSummaryResponse);
      } catch (err) {
        if (!cancelled) setShadowError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setShadowLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function universe() {
    return symbols
      .split(/[,\s]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
  }

  async function run(bucket: AttributionScope = within) {
    setLoading(true);
    setError(null);
    try {
      const list = universe();
      if (list.length === 0) {
        setError("Enter at least one symbol.");
        return;
      }
      const params = new URLSearchParams({
        symbols: list.join(","),
        within: bucket,
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
          This replays GSPS&apos;s trading rules against real, historical price data — as if the
          app had been trading for real the whole time — and shows what would have happened. It&apos;s
          how we check whether a change to the rules actually helps, instead of just guessing.
        </p>
        <p className="mt-2 text-sm text-muted">
          One term shows up everywhere below: <span className="font-medium text-foreground">R</span>{" "}
          means &quot;multiples of what was risked on the trade.&quot; +1R = made back exactly what
          you risked. -1R = lost the full amount you risked. +2R = doubled it. It&apos;s a way to
          compare trades of very different dollar sizes on the same scale.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Live signal quality (shadow mode)</CardTitle>
          <CardDescription>
            Every high-confidence (&quot;Execute&quot;) signal the scheduled scan finds is logged and
            later checked against what actually happened — nothing is traded on it. This shows how
            those real calls have performed, compared against the backtest baseline above.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {shadowLoading && <p className="text-sm text-muted">Loading…</p>}
          {shadowError && <p className="text-sm text-bear">{shadowError}</p>}
          {shadowSummary && (
            <>
              <Table>
                <THead>
                  <TR>
                    <TH />
                    <TH className="text-right">Trades</TH>
                    <TH className="text-right">Win rate</TH>
                    <TH className="text-right">Avg. result / trade</TH>
                  </TR>
                </THead>
                <TBody>
                  <TR>
                    <TD className="font-medium">
                      Live, last {shadowSummary.windowDays} days
                    </TD>
                    <TD className="text-right tabular-nums">{shadowSummary.shadow.trades}</TD>
                    <TD className="text-right tabular-nums">
                      {shadowSummary.shadow.trades === 0 ? "—" : pct(shadowSummary.shadow.winRate)}
                    </TD>
                    <TD className={cn("text-right tabular-nums", toneFor(shadowSummary.shadow.expectancyR))}>
                      {shadowSummary.shadow.trades === 0 ? "—" : r(shadowSummary.shadow.expectancyR)}
                    </TD>
                  </TR>
                  <TR className="border-t-2 border-border">
                    <TD className="font-medium">
                      Backtest baseline{!BASELINE_COMPARABLE && " (earlier rules, not compared)"}
                    </TD>
                    <TD className="text-right tabular-nums">{BACKTEST_BASELINE.trades}</TD>
                    <TD className="text-right tabular-nums">{pct(BACKTEST_BASELINE.winRate)}</TD>
                    <TD className={cn("text-right tabular-nums", toneFor(BACKTEST_BASELINE.expectancyR))}>
                      {r(BACKTEST_BASELINE.expectancyR)}
                    </TD>
                  </TR>
                </TBody>
              </Table>

              <p className="text-xs text-muted">
                {shadowSummary.pending} signal{shadowSummary.pending === 1 ? "" : "s"} still waiting on
                an outcome (up to {shadowSummary.maxHoldDays} trading days each) — not counted above yet. A
                signal counts only once its entry filled on the pullback the same session.
                {BASELINE_COMPARABLE && shadowSummary.shadow.trades < MIN_SHADOW_SAMPLES_HINT &&
                  ` Fewer than ${MIN_SHADOW_SAMPLES_HINT} resolved signals so far — too early to compare against the baseline with any confidence.`}
              </p>

              {shadowSummary.drift && (
                <div className="rounded-lg border border-bear/40 bg-bear-soft/30 p-3">
                  <p className="text-sm font-medium text-bear">
                    <Badge variant="bear">Drift detected</Badge>{" "}
                    Live signal quality has fallen short of the backtest baseline
                  </p>
                  <p className="mt-2 text-sm text-bear">{shadowSummary.drift.reason}</p>
                </div>
              )}
              {BASELINE_COMPARABLE && !shadowSummary.drift && shadowSummary.shadow.trades >= MIN_SHADOW_SAMPLES_HINT && (
                <p className="text-sm text-bull">
                  <Badge variant="bull">On track</Badge> Live performance is tracking the backtest
                  baseline — no drift detected.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card data-tour="backtest-run">
        <CardHeader>
          <CardTitle>Run a test</CardTitle>
          <CardDescription>
            Uses 15-minute price charts, and only ever looks at history that would have been
            available on the day of each trade — never a sneak peek at the future. Every trade is
            taken and managed the way the app trades today: the plan&apos;s entry and stop, the
            stop moved as the trade progresses, and the trade closed on the app&apos;s own exit
            signals. Nothing is sold at a fixed profit goal, so the test asks for none.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="min-w-0 flex-1 text-sm">
              <span className="mb-1 block text-muted">Stocks to test</span>
              <Input
                value={symbols}
                onChange={(e) => setSymbols(e.target.value)}
                placeholder="SPY, AAPL"
              />
            </label>
            <Button onClick={() => run()} disabled={loading}>
              {loading ? "Testing…" : "Run"}
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
              <CardTitle>Results by how confident the app was</CardTitle>
              <CardDescription>
                {report.overall.trades} trades taken out of {report.armed} setups the app noticed (
                {report.triggered} actually triggered), across {report.symbols.length}{" "}
                {report.symbols.length === 1 ? "stock" : "stocks"} · price data from {report.source}
                {report.skipped.length > 0 && ` · ${report.skipped.length} skipped`}
                <br />
                {report.window.from && report.window.to
                  ? `${report.window.from.slice(0, 10)} → ${report.window.to.slice(0, 10)}`
                  : "date range unknown"}
                <br />
                <br />
                Each trade is counted under the app&apos;s verdict at the moment it was entered. A
                setup first found as Watch that had become Execute by the time its entry filled
                counts as Execute; a trade entered while the setup still read Watch counts as Watch.
                Reversals and re-entries the app opens after a stop were never scored, so they sit
                on their own row and count only in &quot;All&quot;.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Table>
                <THead>
                  <TR>
                    <TH>How confident</TH>
                    <TH className="text-right">Trades</TH>
                    <TH className="text-right">Win rate</TH>
                    <TH className="text-right">Still open</TH>
                    <TH className="text-right">Avg. result / trade</TH>
                    <TH className="text-right">Total result</TH>
                    <TH />
                  </TR>
                </THead>
                <TBody>
                  {report.buckets.map((b) => (
                    <SummaryRow
                      key={b.bucket}
                      label={bucketName(b.bucket)}
                      s={b}
                      action={
                        <button
                          onClick={() => run(b.bucket)}
                          disabled={loading || b.trades === 0}
                          className={cn(
                            "cursor-pointer text-xs text-accent hover:underline disabled:cursor-default disabled:text-muted disabled:no-underline",
                            b.bucket === report.attributeWithin && "font-semibold",
                          )}
                        >
                          {b.bucket === report.attributeWithin ? "shown below" : "break down"}
                        </button>
                      }
                    />
                  ))}
                  {report.derivedSplit && (
                    <SummaryRow
                      label="Reversals and re-entries"
                      s={combine(report.derivedSplit.reversal, report.derivedSplit.rebuy)}
                    />
                  )}
                  <SummaryRow
                    label="All"
                    s={report.overall}
                    className="border-t-2 border-border"
                    action={
                      <button
                        onClick={() => run(UNCONDITIONED_ATTRIBUTION)}
                        disabled={loading || report.overall.trades === 0}
                        title="Every scored trade together: the one view where each check is read on its own, not against the others its group already selected."
                        className={cn(
                          "cursor-pointer text-xs text-accent hover:underline disabled:cursor-default disabled:text-muted disabled:no-underline",
                          report.attributeWithin === UNCONDITIONED_ATTRIBUTION && "font-semibold",
                        )}
                      >
                        {report.attributeWithin === UNCONDITIONED_ATTRIBUTION ? "shown below" : "break down"}
                      </button>
                    }
                  />
                </TBody>
              </Table>
              <p className="text-xs text-muted">
                Win rate counts the trades that closed during the test. &quot;Still open&quot;
                trades had no exit yet (the data ended, or the test&apos;s limit of 10 trading
                sessions a trade was reached) and are valued at the last price, inside the average
                but neither a win nor a loss. A trade can lose more often than it wins and still
                average a profit, because the app lets winners run.
              </p>
              {report.buckets.some(
                (b) => b.bucket !== "unscored" && b.trades > 0 && b.trades < MIN_COMPARABLE_TRADES,
              ) && (
                <p className="text-sm text-warn">
                  Some groups hold fewer than {MIN_COMPARABLE_TRADES} trades. A group that small
                  can turn on one or two trades, so it can&apos;t say whether Execute does better or
                  worse than Watch. Test more stocks, or read the larger runs, before comparing.
                </p>
              )}
            </CardContent>
          </Card>

          {report.largeCapSplit && (
            <Card>
              <CardHeader>
                <CardTitle>Big, well-known stocks vs. everything else</CardTitle>
                <CardDescription>
                  Splits every trade into two groups — well-known, heavily-traded companies (like
                  Apple or Microsoft) versus smaller or less-traded ones — so you can see whether
                  they behave differently. Both groups are traded on the same rules.
                  {report.largeCapSplit.largeCap.trades > 0 &&
                    report.largeCapSplit.notLargeCap.trades === 0 && (
                      <>
                        <br />
                        <br />
                        <span className="text-warn">
                          Every stock in this run landed in &quot;Big stocks&quot; and none in
                          &quot;Everything else&quot; — add a few smaller, less-traded names to
                          &quot;Stocks to test&quot; above to get a real comparison.
                        </span>
                      </>
                    )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <THead>
                    <TR>
                      <TH />
                      <TH className="text-right">Trades</TH>
                      <TH className="text-right">Win rate</TH>
                      <TH className="text-right">Avg. result / trade</TH>
                      <TH className="text-right">Total result</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {(
                      [
                        ["Big stocks", report.largeCapSplit.largeCap],
                        ["Everything else", report.largeCapSplit.notLargeCap],
                      ] as const
                    ).map(([label, s]) => (
                      <TR key={label}>
                        <TD className="font-medium">{label}</TD>
                        <TD className="text-right tabular-nums">{s.trades}</TD>
                        <TD className="text-right tabular-nums">
                          {s.trades === 0 ? "—" : pct(s.winRate)}
                        </TD>
                        <TD className={cn("text-right tabular-nums", toneFor(s.expectancyR))}>
                          {s.trades === 0 ? "—" : r(s.expectancyR)}
                        </TD>
                        <TD className={cn("text-right tabular-nums", toneFor(s.totalR))}>
                          {s.trades === 0 ? "—" : r(s.totalR)}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Which checks actually helped, across {scopeName(report.attributeWithin)}</CardTitle>
              <CardDescription>
                For each thing the app checks for, this compares trades where that check passed
                against trades where it didn&apos;t — over the{" "}
                {report.attributeWithin === UNCONDITIONED_ATTRIBUTION
                  ? (report.derivedSplit?.armed.trades ?? report.overall.trades)
                  : (report.buckets.find((b) => b.bucket === report.attributeWithin)?.trades ?? 0)}{" "}
                trades in this group. &quot;Difference&quot; is the size of the edge: a bigger
                positive number means that check is pulling its weight. This shows what travels
                together with good results, not proof that the check itself causes them. The nine
                scored points come first; the checks under them, which earn nothing on their own,
                say which point they count toward.
                {report.attributeWithin !== UNCONDITIONED_ATTRIBUTION && (
                  <>
                    <br />
                    <br />
                    <span className="text-foreground">
                      Read this inside one group with care.
                    </span>{" "}
                    Every trade in {bucketName(report.attributeWithin)} has about the same score, so
                    a trade that passed one check usually failed another to land here. That can
                    make a good check look backwards inside a group. Use &quot;break down&quot; on
                    the All row to see each check across every trade.
                  </>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {report.factors.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted">
                  Not enough scored trades in this group yet. Scoring needs at least{" "}
                  {MIN_DAILY_BARS_HINT} days of price history behind a stock before it counts.
                </p>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH className="sticky left-0 z-10 bg-surface">Check</TH>
                      <TH className="text-right">Passed</TH>
                      <TH className="text-right">Result when passed</TH>
                      <TH className="text-right">Result when failed</TH>
                      <TH className="text-right">Difference</TH>
                      <TH className="text-right">Win-rate difference</TH>
                      <TH className="text-right">How linked</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {report.factors.map((f) => {
                      const readable = f.verdict === "informative";
                      return (
                        <TR key={f.id} className={cn(!readable && "opacity-60")}>
                          <TD className="sticky left-0 z-10 max-w-[16rem] bg-surface">
                            <span className={cn("block truncate", f.kind === "point" && "font-medium")}>
                              {f.label}
                            </span>
                            {f.partOf && (
                              <span className="block truncate text-xs text-muted">
                                counts toward {f.partOf}
                              </span>
                            )}
                            {f.kind === "hold" && (
                              <span className="block truncate text-xs text-muted">
                                can hold a setup back from Execute
                              </span>
                            )}
                            {f.verdict === "constant" && (
                              <Badge variant="muted" className="mt-1">
                                never varied
                              </Badge>
                            )}
                            {f.verdict === "insufficient" && (
                              <Badge variant="muted" className="mt-1">
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
              <CardTitle>Does a tighter or looser stop-loss do better?</CardTitle>
              <CardDescription>
                Groups trades in {scopeName(report.attributeWithin)} by how far the stop-loss sat
                from entry, measured against how much that stock normally moves in one 15-minute
                bar (a tight stop is a small multiple, a loose stop is a large one). The distance is
                known before the trade is placed, which is what makes it worth checking here.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <THead>
                  <TR>
                    <TH>Stop distance (× a normal 15-minute bar)</TH>
                    <TH className="text-right">Trades</TH>
                    <TH className="text-right">Win rate</TH>
                    <TH className="text-right">Avg. result / trade</TH>
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

/** One row of the results table: a verdict group, the reversals, or All. */
function SummaryRow({
  label,
  s,
  action,
  className,
}: {
  label: string;
  s: RunSummary;
  action?: React.ReactNode;
  className?: string;
}) {
  const decided = decidedWinRate(s);
  const empty = s.trades === 0;
  return (
    <TR className={className}>
      <TD className="font-medium">{label}</TD>
      <TD className="text-right tabular-nums">{s.trades}</TD>
      <TD className="text-right tabular-nums">{empty || decided === null ? "—" : pct(decided)}</TD>
      <TD className="text-right tabular-nums text-muted">{empty ? "—" : (s.timeouts ?? 0)}</TD>
      <TD className={cn("text-right tabular-nums", toneFor(s.expectancyR))}>
        {empty ? "—" : r(s.expectancyR)}
      </TD>
      <TD className={cn("text-right tabular-nums", toneFor(s.totalR))}>{empty ? "—" : r(s.totalR)}</TD>
      <TD className="text-right">{action}</TD>
    </TR>
  );
}

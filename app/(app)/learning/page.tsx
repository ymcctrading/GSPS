"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { BacktestReport, Bucket } from "@/lib/backtest/run";
import type { WeightProposal } from "@/lib/backtest/propose-weights";
import { CRITERION_LABELS, type CriterionKey } from "@/lib/scoring/weights";

const DEFAULT_SYMBOLS = "SPY, AAPL, AMD, TSLA, MSFT, NVDA";

interface ProposalResponse {
  live: boolean;
  source: string;
  proposal: WeightProposal;
  stored: { id: string; version: number } | null;
  notStored: string | null;
}

/**
 * Factor rows are keyed by the criterion's stable id, which is what the weights
 * and the replay both use. Fall back to the raw key for anything the score
 * appends outside the nine — the holds carry ids too, and showing the id is
 * better than showing nothing.
 */
function criterionLabel(key: string): string {
  return CRITERION_LABELS[key as CriterionKey] ?? key;
}

const OUTCOME_LABELS: Record<string, string> = {
  adopted: "moves",
  disagreed: "halves disagree",
  unreadable: "not readable",
  "too-small": "inside the noise",
};

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
  // Walks the leeway/large-cap-widened stop instead of the raw pattern one —
  // see ReplayOptions.useProductionStop. Off by default so a first run shows
  // the harness's original, already-understood behaviour; toggling it and
  // re-running is how the "Large-cap vs. not" card below becomes a real
  // before/after rather than one static split.
  // Checked by default: the app's real trading behavior already includes the
  // large-cap widening (lib/strat/large-cap.ts), so a first run should show
  // what actually happens, not a legacy mode nobody trades with any more.
  // Unchecking it is how the "Bigger stocks vs. smaller stocks" card below
  // becomes a true before/after comparison.
  const [productionStop, setProductionStop] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<BacktestReport | null>(null);
  const [proposing, setProposing] = useState(false);
  const [proposalError, setProposalError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<ProposalResponse | null>(null);

  function universe() {
    return symbols
      .split(/[,\s]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
  }

  /**
   * Runs the same replay, splits it in time, and asks what the attribution
   * supports out of sample. The result is written as a draft — it scores
   * nothing until someone promotes it.
   */
  async function propose() {
    setProposing(true);
    setProposalError(null);
    try {
      const params = new URLSearchParams({
        symbols: universe().join(","),
        within,
        targetR,
      });
      const res = await fetch(`/api/learning/propose-weights?${params}`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setProposalError(body.error ?? `Request failed (${res.status})`);
        return;
      }
      setProposal(body as ProposalResponse);
    } catch (err) {
      setProposalError(err instanceof Error ? err.message : String(err));
    } finally {
      setProposing(false);
    }
  }

  async function run(bucket: Bucket = within) {
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
        targetR,
        ...(productionStop ? { productionStop: "1" } : {}),
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
          <CardTitle>Run a test</CardTitle>
          <CardDescription>
            Uses 15-minute price charts, and only ever looks at history that would have been
            available on the day of each trade — never a sneak peek at the future.
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
            <label className="text-sm sm:w-36">
              <span className="mb-1 block text-muted">Profit goal</span>
              <Input
                value={targetR}
                onChange={(e) => setTargetR(e.target.value)}
                inputMode="decimal"
              />
            </label>
            <Button onClick={() => run()} disabled={loading}>
              {loading ? "Testing…" : "Run"}
            </Button>
          </div>
          <p className="text-xs text-muted">
            Profit goal is in R — 2 means &quot;aim to make twice what&apos;s being risked on each
            trade.&quot;
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={productionStop}
              onChange={(e) => setProductionStop(e.target.checked)}
              className="h-4 w-4"
            />
            <span>
              Give big, well-known stocks (like Apple or Microsoft) extra room before their
              stop-loss triggers — this matches how the app actually trades today
            </span>
          </label>
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
                  : "date range unknown"}{" "}
                · at a {report.targetR}R profit goal, you need to win at least{" "}
                {pct(report.breakEvenWinRate)} of the time just to break even
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <THead>
                  <TR>
                    <TH>How confident</TH>
                    <TH className="text-right">Trades</TH>
                    <TH className="text-right">Win rate</TH>
                    <TH className="text-right">Avg. result / trade</TH>
                    <TH className="text-right">Total result</TH>
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

          {report.largeCapSplit && (
            <Card>
              <CardHeader>
                <CardTitle>Big, well-known stocks vs. everything else</CardTitle>
                <CardDescription>
                  Splits every trade into two groups — well-known, heavily-traded companies (like
                  Apple or Microsoft) versus smaller or less-traded ones — so you can see whether
                  they behave differently.
                  <br />
                  <br />
                  Right now this test is using:{" "}
                  <span className="font-medium text-foreground">
                    {report.useProductionStop
                      ? "extra room for big stocks before the stop-loss triggers (how the app trades today)"
                      : "the same stop-loss rules for every stock, big or small (the old behavior)"}
                  </span>
                  . To see whether giving big stocks that extra room actually helps: note the
                  &quot;Big stocks&quot; row below, then check or uncheck the box above, run again,
                  and compare that same row between the two runs. That comparison — not either row
                  on its own — is the answer.
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
              <CardTitle>Which signals actually helped, inside {report.attributeWithin}</CardTitle>
              <CardDescription>
                For each thing the app checks for, this compares trades where that check passed
                against trades where it didn&apos;t — over the{" "}
                {report.buckets.find((b) => b.bucket === report.attributeWithin)?.trades ?? 0} trades
                in this group. &quot;Difference&quot; is the size of the edge: a bigger positive
                number means that check is pulling its weight. This shows what travels together
                with good results, not proof that the check itself causes them.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {report.factors.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted">
                  Not enough scored trades in this group yet. Scoring needs at least 120 days of
                  price history behind a stock before it counts.
                </p>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH className="sticky left-0 z-10 bg-surface">Signal</TH>
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
                        <TR key={f.criterion} className={cn(!readable && "opacity-60")}>
                          <TD className="sticky left-0 z-10 max-w-[16rem] truncate bg-surface">
                            <span title={f.criterion}>{criterionLabel(f.criterion)}</span>
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
              <CardTitle>Suggest better scoring weights</CardTitle>
              <CardDescription>
                Today every one of the nine checks counts equally — a starting guess, not
                something that was ever measured. This tool re-checks that guess: it splits this
                same test into an earlier and a later half, keeps only the checks that kept
                helping in the later half too (so a fluke doesn&apos;t get rewarded), and suggests
                new point values that still add up to nine. Nothing changes automatically — this
                only saves a draft for someone to review and turn on later.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button onClick={propose} disabled={proposing}>
                {proposing ? "Measuring…" : `Suggest weights from ${report.attributeWithin}`}
              </Button>
              {proposalError && <p className="text-sm text-bear">{proposalError}</p>}

              {proposal && (
                <>
                  <p className="text-sm text-muted">
                    {proposal.proposal.inSampleTrades} trades used to build the suggestion ·{" "}
                    {proposal.proposal.outOfSampleTrades} held back to double-check it
                    {proposal.proposal.splitAt &&
                      ` · split at ${proposal.proposal.splitAt.slice(0, 10)}`}
                  </p>

                  {proposal.stored && (
                    <p className="text-sm">
                      <Badge variant="muted">Draft v{proposal.stored.version}</Badge> saved. Someone
                      still has to turn it on before it affects any score.
                    </p>
                  )}
                  {proposal.notStored && <p className="text-sm text-warn">{proposal.notStored}</p>}

                  {proposal.proposal.weights && (
                    <Table>
                      <THead>
                        <TR>
                          <TH>Signal</TH>
                          <TH className="text-right">Current weight</TH>
                          <TH className="text-right">Suggested weight</TH>
                          <TH className="text-right">Held up on first half</TH>
                          <TH className="text-right">Held up on second half</TH>
                          <TH>Verdict</TH>
                        </TR>
                      </THead>
                      <TBody>
                        {proposal.proposal.proposals.map((p) => (
                          <TR key={p.criterion} className={cn(p.outcome !== "adopted" && "opacity-60")}>
                            <TD className="max-w-[14rem] truncate">
                              <span title={p.rationale}>{criterionLabel(p.criterion)}</span>
                            </TD>
                            <TD className="text-right tabular-nums">{p.currentWeight.toFixed(2)}</TD>
                            <TD
                              className={cn(
                                "text-right font-medium tabular-nums",
                                toneFor(p.proposedWeight - p.currentWeight),
                              )}
                            >
                              {p.proposedWeight.toFixed(2)}
                            </TD>
                            <TD className="text-right tabular-nums text-muted">
                              {p.inSampleDeltaR === undefined ? "—" : r(p.inSampleDeltaR)}
                            </TD>
                            <TD className="text-right tabular-nums text-muted">
                              {p.outOfSampleDeltaR === undefined ? "—" : r(p.outOfSampleDeltaR)}
                            </TD>
                            <TD className="text-xs text-muted">{OUTCOME_LABELS[p.outcome]}</TD>
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Does a tighter or looser stop-loss do better?</CardTitle>
              <CardDescription>
                Groups trades in {report.attributeWithin} by how far the stop-loss sat from
                entry, measured against how much that stock normally moves in a day (a tight
                stop is a small multiple, a loose stop is a large one). This is the one dial the
                app already limits automatically, and it&apos;s knowable before the trade is even
                placed — which is what makes it worth checking here.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <THead>
                  <TR>
                    <TH>Stop distance (× a normal day&apos;s move)</TH>
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

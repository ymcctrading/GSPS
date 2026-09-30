"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SetupCardPanel, SetupNameButton, useCardStage } from "@/components/setups/setup-card";
import { formatOpenedAt } from "@/lib/portfolio/opened-at";
import {
  ASSET_KIND_LABELS,
  MOVE_BASIS_LABELS,
  SIGNAL_DESCRIPTIONS,
  SIGNAL_LABELS,
  formatAge,
  formatRvol,
  formatVolume,
  type Alert,
  type ScanOutput,
  type SymbolAudit,
} from "@/lib/scanner/intraday";
import { buildIntradayCardModel, isReversalRisk } from "@/lib/setups/intraday";
import type { IntradayRefreshBudget } from "@/lib/entitlements/intraday-refresh";
import { formatUsd, cn } from "@/lib/utils";
import { intradayTradeHref } from "@/lib/routes";

/**
 * Intraday momentum panel.
 * -----------------------------------------------------------------------------
 * Two things are on screen at all times, and the second one is the point.
 *
 * The alerts say what moved and why it qualified. The audit trail underneath
 * says what happened to every *other* symbol — evaluated and quiet, filtered on
 * volume, suppressed by a cooldown, or never scanned because its data was too
 * old. "The scanner missed it" was previously unanswerable; with the audit
 * open, the answer is a line of text with a timestamp on it.
 *
 * Each alert is the same setup card the daily lists use (project owner,
 * 2026-09-30): the row carries the levels, the name opens the card halfway, and
 * the card expands to everything behind the alert.
 *
 * How often the panel refreshes depends on the tier (2026-09-30,
 * `lib/entitlements/intraday-refresh.ts`). Where nothing is metered it scans on
 * open and every few minutes, as it always did. Where refreshes are counted it
 * does not spend one on its own: it says how many are left and scans when asked.
 *
 * The panel refreshes on a timer while it is open rather than from a scheduled
 * job, because this project's plan allows two cron runs a day and both are
 * already spent. That is stated in the footer rather than hidden: a user who
 * closes the tab is not being scanned for, and they should know that.
 */

const REFRESH_MS = 3 * 60 * 1000;

type ScanResponse = ScanOutput & {
  dataSource?: string;
  dataIsLive?: boolean;
  session?: string;
  unreachable?: string[];
  budget?: IntradayRefreshBudget | null;
};

export function IntradayAlerts({ symbols }: { symbols?: string[] }) {
  const [output, setOutput] = useState<ScanResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A plan without intraday access at all: said plainly, not as a red error.
  const [locked, setLocked] = useState<string | null>(null);
  const [budget, setBudget] = useState<IntradayRefreshBudget | null>(null);
  const [budgetKnown, setBudgetKnown] = useState(false);
  const [showAudit, setShowAudit] = useState(false);

  const query = symbols?.length ? `?symbols=${encodeURIComponent(symbols.join(","))}` : "";

  const run = useCallback(
    () => {
      setLoading(true);
      return fetch(`/api/intraday-scan${query}`)
        .then(async (res) => {
          const data = await res.json();
          if (res.status === 429 && data.budget) setBudget(data.budget);
          if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
          setOutput(data);
          if (data.budget) setBudget(data.budget);
          setError(null);
        })
        .catch((err) => setError(err instanceof Error ? err.message : String(err)))
        .finally(() => setLoading(false));
    },
    [query],
  );

  useEffect(() => {
    // Ask what the plan allows before scanning anything: a metered plan must
    // not have a refresh spent on its behalf just because the page opened.
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    let kickoff: ReturnType<typeof setTimeout> | undefined;

    fetch("/api/intraday-scan?budget=1")
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.status === 403) {
          setLocked(data.error ?? "Intraday scans aren't included in your plan.");
          setBudgetKnown(true);
          return;
        }
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        const known: IntradayRefreshBudget | null = data.budget ?? null;
        setBudget(known);
        setBudgetKnown(true);
        // No budget in the answer means nothing is metered here.
        if (known === null || known.automatic) {
          // The first scan is scheduled rather than called inline: `run` flips
          // the loading flag synchronously, and doing that inside the effect
          // body would set state during the same commit that mounted the panel.
          kickoff = setTimeout(run, 0);
          timer = setInterval(run, REFRESH_MS);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setBudgetKnown(true);
      });

    return () => {
      cancelled = true;
      if (kickoff) clearTimeout(kickoff);
      if (timer) clearInterval(timer);
    };
  }, [run]);

  const metered = budget !== null && !budget.automatic;
  const outOfRefreshes = budget !== null && !budget.allowed;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle>Intraday movement</CardTitle>
            <CardDescription>
              Confirmation of moves that have already happened, with the evidence attached — not a
              forecast. Every alert names what it measured the move against and the price that would
              say it is wrong.
            </CardDescription>
          </div>
          {!locked && (
            <Button
              variant="outline"
              onClick={run}
              disabled={loading || !budgetKnown || outOfRefreshes}
              className="shrink-0"
            >
              {loading ? "Scanning…" : output ? "Rescan" : metered ? "Run the scan" : "Rescan"}
            </Button>
          )}
        </div>
        {metered && budget && <BudgetLine budget={budget} />}
        {output && <FreshnessLine output={output} />}
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {locked && <p className="py-4 text-center text-sm text-muted">{locked}</p>}
        {error && <p className="text-sm text-bear">{error}</p>}

        {!locked && !output && !error && (
          <p className="py-4 text-center text-sm text-muted">
            {loading
              ? "Running the scan…"
              : metered
                ? "Nothing has been scanned yet. Run the scan when you want a fresh read — each run uses one of your refreshes."
                : "No scan has run yet."}
          </p>
        )}

        {output && output.alerts.length === 0 && (
          <p className="py-4 text-center text-sm text-muted">
            Nothing crossed a detection threshold on this pass. Open the audit below to see what each
            symbol was checked against — an empty list here is a result, not a failure.
          </p>
        )}

        {output && consolidateBySymbol(output.alerts).map(({ alert, otherSignals }) => (
          <AlertCard key={alert.symbol} alert={alert} otherSignals={otherSignals} />
        ))}

        {output && (
          <div className="flex flex-col gap-2 border-t border-border pt-3">
            <button
              type="button"
              onClick={() => setShowAudit((v) => !v)}
              aria-expanded={showAudit}
              className="flex cursor-pointer items-center gap-1.5 text-left text-sm font-medium text-muted hover:text-foreground"
            >
              {showAudit ? (
                <ChevronDown className="size-4 shrink-0" aria-hidden />
              ) : (
                <ChevronRight className="size-4 shrink-0" aria-hidden />
              )}
              Why each symbol did or didn&apos;t alert ({output.audit.length} checked)
            </button>
            {showAudit && <AuditTrail audit={output.audit} />}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** How many refreshes are left, on the plan's own terms. */
function BudgetLine({ budget }: { budget: IntradayRefreshBudget }) {
  const day = budget.limitPerDay === "unlimited" ? null : `${budget.remainingToday} of ${budget.limitPerDay} left today`;
  const week =
    budget.limitPerWeek === "unlimited" ? null : `${budget.remainingThisWeek} of ${budget.limitPerWeek} left this week`;
  return (
    <p className="mt-2 text-xs text-muted" data-testid="intraday-budget">
      Your plan refreshes this panel on request: {[day, week].filter(Boolean).join(" · ")}.
      {!budget.allowed && " The next one frees up when the count renews."}
    </p>
  );
}

/**
 * One card per equity, not one per signal type.
 * -----------------------------------------------------------------------------
 * `evaluateSymbol` (lib/scanner/intraday.ts) can return several `Alert`s for
 * the same symbol from a single poll cycle -- opening momentum, trend
 * continuation, and unusual volume can all legitimately fire together on
 * the same pass, since each tests a different condition. Rendering one card
 * per alert meant a stock that qualified three ways showed up three times,
 * which read as three separate opportunities rather than one setup with
 * three confirming signals.
 *
 * The highest-confidence alert becomes the card; every other signal type
 * that also fired for the same symbol this pass is kept, not discarded --
 * several signals agreeing is stronger information than one, so it's shown
 * as a compact "also: X, Y" line on the one card rather than dropped or
 * split back out into its own card.
 *
 * All alerts here share one poll cycle's `triggerTime` (this component
 * always shows the latest scan, replacing rather than accumulating past
 * ones -- see the `run`/`setOutput` callback above), so "most recent"
 * doesn't distinguish them; confidence does the same job "most recent
 * carries the most weight" was asking for when the candidates are
 * simultaneous rather than sequential.
 */
function consolidateBySymbol(alerts: Alert[]): { alert: Alert; otherSignals: Alert[] }[] {
  const bySymbol = new Map<string, Alert[]>();
  for (const alert of alerts) {
    const existing = bySymbol.get(alert.symbol);
    if (existing) existing.push(alert);
    else bySymbol.set(alert.symbol, [alert]);
  }
  return Array.from(bySymbol.values()).map((group) => {
    const sorted = [...group].sort((a, b) => b.confidence - a.confidence);
    return { alert: sorted[0], otherSignals: sorted.slice(1) };
  });
}

function FreshnessLine({ output }: { output: ScanResponse }) {
  return (
    <div className="mt-2 flex flex-col gap-1 border-t border-border pt-2 text-xs">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted">
        <span>Scanned {formatOpenedAt(output.scannedAt)}</span>
        <span>·</span>
        <span>{output.session}</span>
        <span>·</span>
        <span>
          Source: {output.dataSource}
          {output.dataIsLive === false && " (demo data — not live prices)"}
        </span>
      </div>
      {output.staleSymbols.length > 0 && (
        <p className="text-warn">
          Stale feed for {output.staleSymbols.join(", ")} — nothing was called on those.
        </p>
      )}
      {output.unreachable && output.unreachable.length > 0 && (
        <p className="text-warn">
          No market data returned for {output.unreachable.join(", ")} — they were not scanned.
        </p>
      )}
    </div>
  );
}

function AlertCard({ alert, otherSignals = [] }: { alert: Alert; otherSignals?: Alert[] }) {
  const { stage, setStage, toggleName } = useCardStage();
  const up = alert.direction === "up";
  const isRisk = isReversalRisk(alert);
  const model = buildIntradayCardModel(alert);
  const cardId = `intraday-card-${alert.symbol.replace(/[^a-zA-Z0-9-]/g, "_")}`;
  const { levels } = model;

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <SetupNameButton symbol={alert.symbol} stage={stage} controls={cardId} onToggle={toggleName} className="font-semibold" />
            <Badge variant="muted">{ASSET_KIND_LABELS[alert.kind]}</Badge>
            <Badge variant={isRisk ? "warn" : up ? "bull" : "bear"}>
              {SIGNAL_LABELS[alert.type]} {up ? "↑" : "↓"}
            </Badge>
          </div>
          {otherSignals.length > 0 && (
            <p className="mt-1 text-xs text-muted">
              Also qualified this pass:{" "}
              {otherSignals.map((s, i) => (
                <span key={s.type}>
                  {i > 0 && ", "}
                  {SIGNAL_LABELS[s.type]} ({s.direction === "up" ? "↑" : "↓"})
                </span>
              ))}
              {" — shown here as confirming signals, not separate setups."}
            </p>
          )}
        </div>

        <div className="shrink-0 text-right">
          <p className={cn("font-mono text-sm font-medium", up ? "text-bull" : "text-bear")}>
            {alert.move.absolute >= 0 ? "+" : ""}
            {formatUsd(alert.move.absolute)} ({alert.move.percent.toFixed(2)}%)
          </p>
          <p className="text-xs text-muted">from {MOVE_BASIS_LABELS[alert.move.basis]}</p>
        </div>
      </div>

      {/* The same levels as the daily lists' rows, in the same order. A reversal
          risk is a reason to stand aside, so it prices nothing. */}
      {isRisk ? (
        <p className="mt-2 text-xs text-muted">Price {formatUsd(alert.move.current)} — no levels: this is a reason to stand aside.</p>
      ) : (
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-5">
          <Field label="Price" value={formatUsd(alert.move.current)} />
          <Field label="Entry" value={levels.entry != null ? formatUsd(levels.entry) : "—"} />
          <Field label="Exit (S/L)" value={levels.stop != null ? formatUsd(levels.stop) : "—"} />
          <Field label="TP1" value={levels.tp1 != null ? formatUsd(levels.tp1) : "—"} />
          <Field label="MTP" value="—" />
        </dl>
      )}

      {stage !== "closed" && (
        <SetupCardPanel
          id={cardId}
          model={model}
          stage={stage}
          onStageChange={setStage}
          className="mt-3"
          headline={
            <Badge variant={isRisk ? "warn" : up ? "bull" : "bear"} className="px-3 py-1 text-sm">
              {alert.confidence}/100 confidence
            </Badge>
          }
          actions={
            !isRisk && (
              <Link
                href={intradayTradeHref(alert.symbol, up ? "buy" : "sell")}
                className="min-h-8 cursor-pointer text-sm font-medium text-accent hover:underline"
              >
                Trade this →
              </Link>
            )
          }
          extra={
            <div className="flex flex-col gap-3 border-t border-border pt-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted">What this signal means</p>
                <p className="mt-1 text-sm text-muted">{SIGNAL_DESCRIPTIONS[alert.type]}</p>
                <p className="mt-2 text-sm">{alert.whyThisAppeared}</p>
              </div>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
                <Field label="Reference" value={formatUsd(alert.move.reference)} />
                <Field label="Day's 50% point" value={formatUsd(alert.midpoint)} />
                <Field label="Rel. volume" value={formatRvol(alert.relativeVolume)} />
                <Field label="Session volume" value={formatVolume(alert.sessionVolume)} />
                <Field label="Data age" value={formatAge(alert.dataAgeSeconds)} />
              </dl>

              {!isRisk && (
                <p className="text-xs text-muted">
                  Intraday setups price an exit and a first target only — there is no MTP (master take profit) on
                  one. TP1 here is twice the distance from entry to exit, a multiple of the risk rather than a
                  chart level.
                </p>
              )}

              <Plan
                title="If it continues"
                plan={alert.continuationPlan}
                note="Entry confirmation, the level that says you're wrong, and the first place to take something off."
              />
              <Plan
                title="If it turns"
                plan={alert.pivotPlan}
                note="What would invalidate the continuation, and what a trade in the other direction would need before it's worth considering."
              />

              {alert.whyNotEarlier && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted">
                    Why this wasn&apos;t flagged earlier
                  </p>
                  <p className="mt-1 text-sm text-muted">{alert.whyNotEarlier}</p>
                </div>
              )}

              <p className="text-xs text-muted">
                Trigger time {formatOpenedAt(alert.triggerTime)} · data timestamp{" "}
                {formatOpenedAt(alert.dataTimestamp)}. Educational information, not a recommendation —
                the right answer is often no trade.
              </p>
            </div>
          }
        />
      )}
    </div>
  );
}

function Plan({
  title,
  plan,
  note,
}: {
  title: string;
  plan: Alert["continuationPlan"];
  note: string;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{title}</p>
      <p className="text-xs text-muted">{note}</p>
      <dl className="mt-1 flex flex-col gap-1 text-sm">
        <PlanLine label="Confirmation" value={plan.confirmation} />
        <PlanLine
          label="Invalidation"
          value={plan.invalidation != null ? formatUsd(plan.invalidation) : "Not defined"}
        />
        <PlanLine
          label="First target"
          value={plan.firstTarget != null ? formatUsd(plan.firstTarget) : "Not defined"}
        />
        <PlanLine label="Cancel if" value={plan.cancelIf} />
      </dl>
    </div>
  );
}

function PlanLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
      <dt className="shrink-0 text-xs uppercase tracking-wide text-muted sm:w-28">{label}</dt>
      <dd className="min-w-0">{value}</dd>
    </div>
  );
}

const OUTCOME_TONE: Record<SymbolAudit["outcome"], "bull" | "warn" | "muted"> = {
  alerted: "bull",
  stale_data: "warn",
  suppressed: "warn",
  insufficient_data: "warn",
  filtered: "muted",
  no_signal: "muted",
};

const OUTCOME_LABELS: Record<SymbolAudit["outcome"], string> = {
  alerted: "Alerted",
  no_signal: "Checked — quiet",
  suppressed: "Suppressed",
  stale_data: "Stale data",
  insufficient_data: "No data",
  filtered: "Filtered out",
};

function AuditTrail({ audit }: { audit: SymbolAudit[] }) {
  return (
    <div className="flex flex-col gap-2">
      {audit.map((row) => (
        <div key={row.symbol} className="rounded-lg border border-border p-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{row.symbol}</span>
            <Badge variant="muted">{ASSET_KIND_LABELS[row.kind]}</Badge>
            <Badge variant={OUTCOME_TONE[row.outcome]}>{OUTCOME_LABELS[row.outcome]}</Badge>
            {row.dataAgeSeconds != null && (
              <span className="text-xs text-muted">data {formatAge(row.dataAgeSeconds)} old</span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted">{row.reason}</p>
          {row.checks.length > 0 && (
            <ul className="mt-1.5 flex flex-col gap-0.5">
              {row.checks.map((check, i) => (
                <li key={`${check.name}-${i}`} className="flex items-start gap-2 text-xs">
                  <span
                    className={cn("shrink-0 font-mono", check.passed ? "text-bull" : "text-muted")}
                    aria-hidden
                  >
                    {check.passed ? "✓" : "✗"}
                  </span>
                  <span className="text-muted">
                    <span className="font-medium">{check.name}:</span> {check.detail}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 sm:flex-col sm:items-start sm:gap-0">
      <dt className="text-muted">{label}</dt>
      <dd className="font-mono tabular-nums">{value}</dd>
    </div>
  );
}
